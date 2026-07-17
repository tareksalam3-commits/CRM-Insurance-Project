CREATE TABLE IF NOT EXISTS payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    installment_id uuid NOT NULL REFERENCES installments(id) ON DELETE RESTRICT,
    amount decimal(12,2) NOT NULL,
    paid_at timestamptz NOT NULL DEFAULT now(),
    paid_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    payment_month date NOT NULL,
    is_cancelled boolean NOT NULL DEFAULT false,
    cancelled_at timestamptz,
    cancelled_by_user_id uuid REFERENCES users(id),
    cancel_reason text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT valid_payment_amount CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_payments_installment_id ON payments(installment_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_by_user_id ON payments(paid_by_user_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON payments(paid_at);
CREATE INDEX IF NOT EXISTS idx_payments_payment_month ON payments(payment_month);
CREATE INDEX IF NOT EXISTS idx_payments_is_cancelled ON payments(is_cancelled);

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_select_hierarchy" ON payments;
CREATE POLICY "payments_select_hierarchy" ON payments FOR SELECT
    TO authenticated
    USING (
        installment_id IN (
            SELECT i.id FROM installments i
            JOIN policies p ON i.policy_id = p.id
            WHERE p.owner_id IN (SELECT unnest(get_user_subtree(auth.uid())))
        )
    );

DROP POLICY IF EXISTS "payments_insert_owner" ON payments;
CREATE POLICY "payments_insert_owner" ON payments FOR INSERT
    TO authenticated
    WITH CHECK (
        paid_by_user_id = auth.uid() AND
        installment_id IN (
            SELECT i.id FROM installments i
            JOIN policies p ON i.policy_id = p.id
            WHERE p.owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "payments_update_cancel" ON payments;
CREATE POLICY "payments_update_cancel" ON payments FOR UPDATE
    TO authenticated
    USING (
        paid_by_user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role IN ('super_admin', 'development_manager', 'general_supervisor', 'supervisor')
        )
    )
    WITH CHECK (
        paid_by_user_id = auth.uid() OR
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role IN ('super_admin', 'development_manager', 'general_supervisor', 'supervisor')
        )
    );

-- Trigger: update installment status after payment
CREATE OR REPLACE FUNCTION record_payment()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE installments
    SET status = 'paid',
        paid_at = NEW.paid_at,
        updated_at = now()
    WHERE id = NEW.installment_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS after_payment_insert ON payments;
CREATE TRIGGER after_payment_insert
    AFTER INSERT ON payments
    FOR EACH ROW
    WHEN (NEW.is_cancelled = false)
    EXECUTE FUNCTION record_payment();

-- Trigger: revert installment status on payment cancellation
CREATE OR REPLACE FUNCTION cancel_payment()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE installments
    SET status = CASE 
        WHEN due_date < CURRENT_DATE THEN 'overdue'::installment_status
        ELSE 'pending'::installment_status
    END,
        paid_at = NULL,
        updated_at = now()
    WHERE id = NEW.installment_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS after_payment_cancel ON payments;
CREATE TRIGGER after_payment_cancel
    AFTER UPDATE ON payments
    FOR EACH ROW
    WHEN (OLD.is_cancelled = false AND NEW.is_cancelled = true)
    EXECUTE FUNCTION cancel_payment();
;
