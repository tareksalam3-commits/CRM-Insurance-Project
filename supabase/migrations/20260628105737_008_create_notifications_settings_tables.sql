/*
# Create Notifications and Settings Tables

1. New Tables
   - `notifications` - In-app notifications
   - `settings` - System settings (single row for company settings)

2. Notifications
   - `id` (uuid, primary key)
   - `user_id` (uuid, references users) - Recipient
   - `type` (enum) - Notification type
   - `title` (text) - Notification title
   - `message` (text) - Notification message
   - `entity_type` (text) - Related entity type
   - `entity_id` (uuid) - Related entity ID
   - `is_read` (boolean) - Whether read
   - `created_at` (timestamp)

3. Settings
   - `id` (uuid, primary key)
   - `company_name` (text)
   - `company_logo_url` (text)
   - `insurance_year_start` (date)
   - `notification_days_before` (int) - Days before due date to notify
   - `created_at` (timestamp)
   - `updated_at` (timestamp)

4. Important Notes
   - Each notification shows only ONCE and is marked as read after viewing
   - Settings table has only one row
   - Auto-suspend happens when installment is 2 months overdue

5. Security
   - Enable RLS on both tables
*/

-- Create enum for notification type
DO $$ BEGIN
    CREATE TYPE notification_type AS ENUM (
        'due_today',
        'due_this_week',
        'overdue',
        'policy_suspended',
        'policy_reactivated',
        'payment_received',
        'payment_cancelled'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create notifications table
CREATE TABLE IF NOT EXISTS notifications (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type notification_type NOT NULL,
    title text NOT NULL,
    message text NOT NULL,
    entity_type text,
    entity_id uuid,
    is_read boolean NOT NULL DEFAULT false,
    read_at timestamptz,
    created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_is_read ON notifications(is_read);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at ON notifications(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_type ON notifications(type);

-- Enable RLS
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "notifications_select_own" ON notifications;
CREATE POLICY "notifications_select_own" ON notifications FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "notifications_update_own" ON notifications;
CREATE POLICY "notifications_update_own" ON notifications FOR UPDATE
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- Create settings table
CREATE TABLE IF NOT EXISTS settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    company_name text DEFAULT 'شركة التأمين',
    company_logo_url text,
    insurance_year_start date,
    notification_days_before int DEFAULT 7,
    overdue_months_to_suspend int DEFAULT 2,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT single_row_table CHECK (id IS NOT NULL)
);

-- Enable RLS
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;

-- RLS Policies - settings visible to all authenticated, editable by super_admin only
DROP POLICY IF EXISTS "settings_select_all" ON settings;
CREATE POLICY "settings_select_all" ON settings FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "settings_update_super_admin" ON settings;
CREATE POLICY "settings_update_super_admin" ON settings FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role = 'super_admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role = 'super_admin'
        )
    );

-- Insert default settings row
INSERT INTO settings (id) VALUES (gen_random_uuid())
ON CONFLICT DO NOTHING;

-- Trigger for settings updated_at
DROP TRIGGER IF EXISTS update_settings_updated_at ON settings;
CREATE TRIGGER update_settings_updated_at
    BEFORE UPDATE ON settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Function to create due notifications
CREATE OR REPLACE FUNCTION create_due_notifications()
RETURNS void AS $$
DECLARE
    rec record;
    overdue_date date;
BEGIN
    -- Get settings for notification days
    SELECT notification_days_before INTO overdue_date FROM settings LIMIT 1;
    IF overdue_date IS NULL THEN overdue_date := 7; END IF;
    
    -- Due today notifications
    FOR rec IN 
        SELECT DISTINCT i.*, p.policy_number, c.name as customer_name, p.owner_id
        FROM installments i
        JOIN policies p ON i.policy_id = p.id
        JOIN customers c ON p.customer_id = c.id
        WHERE i.due_date = CURRENT_DATE
        AND i.status = 'pending'
        AND NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.entity_id = i.id
            AND n.type = 'due_today'
            AND n.user_id = p.owner_id
        )
    LOOP
        INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
        VALUES (
            rec.owner_id,
            'due_today',
            'قسط مستحق اليوم',
            'القسط رقم ' || rec.installment_number || ' للوصل رقم ' || rec.policy_number || ' للعميل ' || rec.customer_name || ' مستحق اليوم',
            'installment',
            rec.id
        );
    END LOOP;
    
    -- Due this week notifications
    FOR rec IN 
        SELECT DISTINCT i.*, p.policy_number, c.name as customer_name, p.owner_id
        FROM installments i
        JOIN policies p ON i.policy_id = p.id
        JOIN customers c ON p.customer_id = c.id
        WHERE i.due_date BETWEEN CURRENT_DATE + interval '1 day' AND CURRENT_DATE + overdue_date
        AND i.status = 'pending'
        AND NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.entity_id = i.id
            AND n.type = 'due_this_week'
            AND n.user_id = p.owner_id
        )
    LOOP
        INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
        VALUES (
            rec.owner_id,
            'due_this_week',
            'قسط مستحق هذا الأسبوع',
            'القسط رقم ' || rec.installment_number || ' للوصل رقم ' || rec.policy_number || ' للعميل ' || rec.customer_name || ' مستحق في ' || to_char(rec.due_date, 'DD/MM/YYYY'),
            'installment',
            rec.id
        );
    END LOOP;
    
    -- Overdue notifications (and suspend policies after 2 months)
    FOR rec IN 
        SELECT DISTINCT i.*, p.policy_number, c.name as customer_name, p.owner_id, u.manager_id
        FROM installments i
        JOIN policies p ON i.policy_id = p.id
        JOIN customers c ON p.customer_id = c.id
        JOIN users u ON p.owner_id = u.id
        WHERE i.due_date < CURRENT_DATE - interval '2 months'
        AND i.status = 'pending'
    LOOP
        -- Suspend the policy
        UPDATE policies 
        SET status = 'suspended',
            suspended_at = now(),
            suspended_reason = 'تأخر السداد أكثر من شهرين'
        WHERE id = rec.policy_id
        AND status = 'active';
        
        -- Update installment status to overdue
        UPDATE installments 
        SET status = 'overdue'
        WHERE id = rec.id;
        
        -- Notify owner (only once)
        IF NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.entity_id = rec.policy_id
            AND n.type = 'policy_suspended'
            AND n.user_id = rec.owner_id
        ) THEN
            INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
            VALUES (
                rec.owner_id,
                'policy_suspended',
                'تم إيقاف الوصل تلقائياً',
                'تم إيقاف الوصل رقم ' || rec.policy_number || ' لتأخر السداد أكثر من شهرين',
                'policy',
                rec.policy_id
            );
            
            -- Also notify manager
            IF rec.manager_id IS NOT NULL THEN
                INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
                VALUES (
                    rec.manager_id,
                    'policy_suspended',
                    'تم إيقاف وصل تلقائياً',
                    'تم إيقاف الوصل رقم ' || rec.policy_number || ' لتأخر السداد أكثر من شهرين',
                    'policy',
                    rec.policy_id
                );
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
