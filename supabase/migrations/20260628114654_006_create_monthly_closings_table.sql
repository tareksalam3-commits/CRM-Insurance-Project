CREATE TABLE IF NOT EXISTS monthly_closings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    month date UNIQUE NOT NULL,
    closed_by_user_id uuid NOT NULL REFERENCES users(id),
    closed_at timestamptz NOT NULL DEFAULT now(),
    is_open boolean NOT NULL DEFAULT false,
    opened_at timestamptz,
    opened_by_user_id uuid REFERENCES users(id),
    notes text,
    created_at timestamptz DEFAULT now(),
    CONSTRAINT check_month_first_day CHECK (date_trunc('month', month)::date = month)
);

CREATE INDEX IF NOT EXISTS idx_monthly_closings_month ON monthly_closings(month);
CREATE INDEX IF NOT EXISTS idx_monthly_closings_closed_by ON monthly_closings(closed_by_user_id);
CREATE INDEX IF NOT EXISTS idx_monthly_closings_is_open ON monthly_closings(is_open);

ALTER TABLE monthly_closings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "monthly_closings_select" ON monthly_closings;
CREATE POLICY "monthly_closings_select" ON monthly_closings FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "monthly_closings_insert_supervisor" ON monthly_closings;
CREATE POLICY "monthly_closings_insert_supervisor" ON monthly_closings FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role IN ('supervisor', 'general_supervisor', 'development_manager', 'super_admin')
        )
    );

DROP POLICY IF EXISTS "monthly_closings_update_supervisor" ON monthly_closings;
CREATE POLICY "monthly_closings_update_supervisor" ON monthly_closings FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role IN ('supervisor', 'general_supervisor', 'development_manager', 'super_admin')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users 
            WHERE id = auth.uid() 
            AND role IN ('supervisor', 'general_supervisor', 'development_manager', 'super_admin')
        )
    );

CREATE OR REPLACE FUNCTION is_month_closed(check_month date)
RETURNS boolean AS $$
DECLARE
    v_is_closed boolean;
BEGIN
    SELECT (is_open = false) INTO v_is_closed
    FROM monthly_closings
    WHERE month = date_trunc('month', check_month)::date;
    
    RETURN COALESCE(v_is_closed, false);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
;
