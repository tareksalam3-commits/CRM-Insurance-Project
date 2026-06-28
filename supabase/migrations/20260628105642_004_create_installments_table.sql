/*
# Create Installments Table

1. New Tables
   - `installments` - Installments for the first insurance year only
   - `id` (uuid, primary key)
   - `policy_id` (uuid, references policies)
   - `installment_number` (int) - Installment number within the year
   - `amount` (decimal) - Installment amount
   - `due_date` (date) - Due date
   - `status` (enum: pending, paid, overdue)
   - `paid_at` (timestamp) - Actual payment date
   - `is_first` (boolean) - True if this is the first installment (new production)

2. Important Notes
   - Only first insurance year installments are stored
   - No renewal year installments in this system
   - First installment (is_first=true) represents new production
   - When installment is paid, it counts toward target
   - No partial payments - either fully paid or not paid

3. Automatic Calculations
   - Number of installments based on payment_method:
     * monthly: 12 installments
     * quarterly: 4 installments
     * semi_annual: 2 installments
     * annual: 1 installment
   - Due dates calculated from policy start_date

4. Security
   - Enable RLS on `installments`
   - Users can see installments for policies they own or below them
   - Payment operations through the payment table
*/

-- Create enum for installment status
DO $$ BEGIN
    CREATE TYPE installment_status AS ENUM (
        'pending',
        'paid',
        'overdue'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- Create installments table
CREATE TABLE IF NOT EXISTS installments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id uuid NOT NULL REFERENCES policies(id) ON DELETE RESTRICT,
    installment_number int NOT NULL,
    amount decimal(12,2) NOT NULL,
    due_date date NOT NULL,
    status installment_status NOT NULL DEFAULT 'pending',
    paid_at timestamptz,
    is_first boolean NOT NULL DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT unique_policy_installment UNIQUE (policy_id, installment_number)
);

-- Create indexes
CREATE INDEX IF NOT EXISTS idx_installments_policy_id ON installments(policy_id);
CREATE INDEX IF NOT EXISTS idx_installments_status ON installments(status);
CREATE INDEX IF NOT EXISTS idx_installments_due_date ON installments(due_date);
CREATE INDEX IF NOT EXISTS idx_installments_paid_at ON installments(paid_at);
CREATE INDEX IF NOT EXISTS idx_installments_is_first ON installments(is_first);

-- Enable RLS
ALTER TABLE installments ENABLE ROW LEVEL SECURITY;

-- RLS Policies - access through policy hierarchy
DROP POLICY IF EXISTS "installments_select_hierarchy" ON installments;
CREATE POLICY "installments_select_hierarchy" ON installments FOR SELECT
    TO authenticated
    USING (
        policy_id IN (
            SELECT id FROM policies 
            WHERE owner_id IN (SELECT unnest(get_user_subtree(auth.uid())))
        )
    );

DROP POLICY IF EXISTS "installments_insert_system" ON installments;
CREATE POLICY "installments_insert_system" ON installments FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM policies 
            WHERE policies.id = installments.policy_id
            AND policies.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "installments_update_system" ON installments;
CREATE POLICY "installments_update_system" ON installments FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM policies 
            WHERE policies.id = installments.policy_id
            AND policies.owner_id IN (SELECT unnest(get_user_subtree(auth.uid())))
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM policies 
            WHERE policies.id = installments.policy_id
            AND policies.owner_id IN (SELECT unnest(get_user_subtree(auth.uid())))
        )
    );

-- Trigger for updated_at
DROP TRIGGER IF EXISTS update_installments_updated_at ON installments;
CREATE TRIGGER update_installments_updated_at
    BEFORE UPDATE ON installments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- Function to automatically generate installments for a policy
CREATE OR REPLACE FUNCTION generate_installments(
    p_policy_id uuid,
    p_start_date date,
    p_payment_method payment_method,
    p_premium_amount decimal
) RETURNS void AS $$
DECLARE
    v_installment_count int;
    v_months_interval int;
    v_installment_number int;
    v_due_date date;
BEGIN
    -- Determine installment count and interval based on payment method
    CASE p_payment_method
        WHEN 'monthly' THEN
            v_installment_count := 12;
            v_months_interval := 1;
        WHEN 'quarterly' THEN
            v_installment_count := 4;
            v_months_interval := 3;
        WHEN 'semi_annual' THEN
            v_installment_count := 2;
            v_months_interval := 6;
        WHEN 'annual' THEN
            v_installment_count := 1;
            v_months_interval := 12;
    END CASE;
    
    -- Generate installments
    FOR v_installment_number IN 1..v_installment_count LOOP
        v_due_date := p_start_date + (v_installment_number - 1) * interval '1 month' * v_months_interval;
        
        INSERT INTO installments (
            policy_id,
            installment_number,
            amount,
            due_date,
            is_first
        ) VALUES (
            p_policy_id,
            v_installment_number,
            p_premium_amount,
            v_due_date,
            v_installment_number = 1
        );
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to regenerate installments when policy is updated
CREATE OR REPLACE FUNCTION regenerate_installments()
RETURNS TRIGGER AS $$
BEGIN
    -- Only regenerate if relevant fields changed
    IF OLD.start_date IS DISTINCT FROM NEW.start_date 
       OR OLD.payment_method IS DISTINCT FROM NEW.payment_method
       OR OLD.premium_amount IS DISTINCT FROM NEW.premium_amount THEN
        
        -- Delete pending unpaid installments
        DELETE FROM installments 
        WHERE policy_id = NEW.id 
        AND status = 'pending';
        
        -- Regenerate installments
        PERFORM generate_installments(
            NEW.id,
            NEW.start_date,
            NEW.payment_method,
            NEW.premium_amount
        );
    END IF;
    
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to regenerate installments on policy update
DROP TRIGGER IF EXISTS policy_installments_update ON policies;
CREATE TRIGGER policy_installments_update
    AFTER UPDATE ON policies
    FOR EACH ROW
    EXECUTE FUNCTION regenerate_installments();
