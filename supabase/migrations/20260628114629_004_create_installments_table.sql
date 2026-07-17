DO $$ BEGIN
    CREATE TYPE installment_status AS ENUM (
        'pending',
        'paid',
        'overdue'
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

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

CREATE INDEX IF NOT EXISTS idx_installments_policy_id ON installments(policy_id);
CREATE INDEX IF NOT EXISTS idx_installments_status ON installments(status);
CREATE INDEX IF NOT EXISTS idx_installments_due_date ON installments(due_date);
CREATE INDEX IF NOT EXISTS idx_installments_paid_at ON installments(paid_at);
CREATE INDEX IF NOT EXISTS idx_installments_is_first ON installments(is_first);

ALTER TABLE installments ENABLE ROW LEVEL SECURITY;

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
    
    FOR v_installment_number IN 1..v_installment_count LOOP
        v_due_date := p_start_date + ((v_installment_number - 1) * v_months_interval || ' months')::interval;
        
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
    IF OLD.start_date IS DISTINCT FROM NEW.start_date 
       OR OLD.payment_method IS DISTINCT FROM NEW.payment_method
       OR OLD.premium_amount IS DISTINCT FROM NEW.premium_amount THEN
        
        -- Delete pending unpaid installments only
        DELETE FROM installments 
        WHERE policy_id = NEW.id 
        AND status = 'pending';
        
        -- Regenerate installments (skip existing paid ones)
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

DROP TRIGGER IF EXISTS policy_installments_update ON policies;
CREATE TRIGGER policy_installments_update
    AFTER UPDATE ON policies
    FOR EACH ROW
    EXECUTE FUNCTION regenerate_installments();
;
