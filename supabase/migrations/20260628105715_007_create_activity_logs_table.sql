/*
# Create Activity Logs Table

1. New Tables
   - `activity_logs` - System activity logging
   - `id` (uuid, primary key)
   - `user_id` (uuid, references users) - User who performed action
   - `action_type` (enum) - Type of action
   - `entity_type` (text) - Type of entity affected
   - `entity_id` (uuid) - ID of affected entity
   - `old_values` (jsonb) - Values before change
   - `new_values` (jsonb) - Values after change
   - `created_at` (timestamp)

2. Action Types
   - login, logout
   - user_create, user_update, user_delete, user_transfer, user_disable
   - customer_create, customer_update, customer_delete
   - policy_create, policy_update, policy_suspend, policy_reactivate, policy_cancel
   - payment_create, payment_cancel
   - month_close, month_open
   - settings_update

3. Important Notes
   - All actions are logged automatically
   - Users can only see their own logs and logs of users below them
   - Logs cannot be deleted (append-only)

4. Security
   - Enable RLS on `activity_logs`
*/

-- Create enum for action type
DO $$ BEGIN
    CREATE TYPE action_type AS ENUM (
        'login',
        'logout',
        'user_create',
        'user_update',
        'user_delete',
        'user_transfer',
        'user_disable',
        'user_enable',
        'customer_create',
        'customer_update',
        'customer_delete',
        'policy_create',
        'policy_update',
        'policy_suspend',
        'policy_reactivate',
        'policy_cancel',
        'payment_create',
        'payment_cancel',
        'month_close',
        'month_open',
        'settings_update',
        'role_update',
        'target_update'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create activity_logs table
CREATE TABLE IF NOT EXISTS activity_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    action_type action_type NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    old_values jsonb,
    new_values jsonb,
    ip_address text,
    user_agent text,
    created_at timestamptz DEFAULT now()
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_action_type ON activity_logs(action_type);
CREATE INDEX IF NOT EXISTS idx_activity_logs_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at ON activity_logs(created_at DESC);

-- Enable RLS
ALTER TABLE activity_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
DROP POLICY IF EXISTS "activity_logs_select_hierarchy" ON activity_logs;
CREATE POLICY "activity_logs_select_hierarchy" ON activity_logs FOR SELECT
    TO authenticated
    USING (user_id IN (SELECT unnest(get_user_subtree(auth.uid()))));

DROP POLICY IF EXISTS "activity_logs_insert_all" ON activity_logs;
CREATE POLICY "activity_logs_insert_all" ON activity_logs FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());

-- Function to log activity
CREATE OR REPLACE FUNCTION log_activity(
    p_action action_type,
    p_entity_type text,
    p_entity_id uuid DEFAULT NULL,
    p_old_values jsonb DEFAULT NULL,
    p_new_values jsonb DEFAULT NULL
) RETURNS void AS $$
DECLARE
    current_user_id uuid;
BEGIN
    current_user_id := auth.uid();
    
    IF current_user_id IS NULL THEN
        RETURN;
    END IF;
    
    INSERT INTO activity_logs (
        user_id,
        action_type,
        entity_type,
        entity_id,
        old_values,
        new_values
    ) VALUES (
        current_user_id,
        p_action,
        p_entity_type,
        p_entity_id,
        p_old_values,
        p_new_values
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
