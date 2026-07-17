-- جدول تحصيلات السنة الثانية (منفصل تماماً عن installments/payments)
CREATE TABLE IF NOT EXISTS year2_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    policy_id uuid NOT NULL REFERENCES policies(id) ON DELETE RESTRICT,
    amount decimal(12,2) NOT NULL,
    payment_date date NOT NULL DEFAULT CURRENT_DATE,
    payment_month date NOT NULL,
    paid_by_user_id uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    notes text,
    is_cancelled boolean NOT NULL DEFAULT false,
    cancelled_at timestamptz,
    cancelled_by_user_id uuid REFERENCES users(id),
    cancel_reason text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT valid_year2_payment_amount CHECK (amount > 0)
);

CREATE INDEX IF NOT EXISTS idx_year2_payments_policy_id ON year2_payments(policy_id);
CREATE INDEX IF NOT EXISTS idx_year2_payments_payment_date ON year2_payments(payment_date);
CREATE INDEX IF NOT EXISTS idx_year2_payments_payment_month ON year2_payments(payment_month);
CREATE INDEX IF NOT EXISTS idx_year2_payments_is_cancelled ON year2_payments(is_cancelled);
CREATE INDEX IF NOT EXISTS idx_year2_payments_paid_by ON year2_payments(paid_by_user_id);

ALTER TABLE year2_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "year2_payments_select_hierarchy" ON year2_payments;
CREATE POLICY "year2_payments_select_hierarchy" ON year2_payments FOR SELECT
    TO authenticated
    USING (
        policy_id IN (
            SELECT id FROM policies
            WHERE owner_id IN (SELECT unnest(get_user_subtree(auth.uid())))
        )
    );

DROP POLICY IF EXISTS "year2_payments_insert_owner" ON year2_payments;
CREATE POLICY "year2_payments_insert_owner" ON year2_payments FOR INSERT
    TO authenticated
    WITH CHECK (
        paid_by_user_id = auth.uid() AND
        policy_id IN (
            SELECT id FROM policies WHERE owner_id = auth.uid()
        )
    );

DROP POLICY IF EXISTS "year2_payments_update_cancel" ON year2_payments;
CREATE POLICY "year2_payments_update_cancel" ON year2_payments FOR UPDATE
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
