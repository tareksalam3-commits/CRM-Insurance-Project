-- Dashboard statistics function
CREATE OR REPLACE FUNCTION get_dashboard_stats(p_user_id uuid DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
    v_user_id uuid;
    v_subtree uuid[];
    v_month_start date;
    v_month_end date;
    v_result jsonb;
BEGIN
    v_user_id := COALESCE(p_user_id, auth.uid());
    v_subtree := get_user_subtree(v_user_id);
    v_month_start := date_trunc('month', CURRENT_DATE)::date;
    v_month_end := (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date;
    
    SELECT jsonb_build_object(
        'total_customers', (
            SELECT COUNT(*) FROM customers WHERE owner_id = ANY(v_subtree)
        ),
        'active_policies', (
            SELECT COUNT(*) FROM policies WHERE owner_id = ANY(v_subtree) AND status = 'active'
        ),
        'suspended_policies', (
            SELECT COUNT(*) FROM policies WHERE owner_id = ANY(v_subtree) AND status = 'suspended'
        ),
        'cancelled_policies', (
            SELECT COUNT(*) FROM policies WHERE owner_id = ANY(v_subtree) AND status = 'cancelled'
        ),
        'new_production_this_month', (
            SELECT COALESCE(SUM(i.amount), 0)
            FROM installments i
            JOIN policies p ON i.policy_id = p.id
            WHERE p.owner_id = ANY(v_subtree)
            AND i.is_first = true
            AND i.status = 'paid'
            AND i.paid_at >= v_month_start
            AND i.paid_at < v_month_start + interval '1 month'
        ),
        'collection_this_month', (
            SELECT COALESCE(SUM(pay.amount), 0)
            FROM payments pay
            JOIN installments i ON pay.installment_id = i.id
            JOIN policies p ON i.policy_id = p.id
            WHERE p.owner_id = ANY(v_subtree)
            AND pay.is_cancelled = false
            AND pay.payment_month = v_month_start
        ),
        'pending_installments_count', (
            SELECT COUNT(*)
            FROM installments i
            JOIN policies p ON i.policy_id = p.id
            WHERE p.owner_id = ANY(v_subtree)
            AND i.status IN ('pending', 'overdue')
            AND i.due_date <= CURRENT_DATE
        ),
        'due_this_week', (
            SELECT COUNT(*)
            FROM installments i
            JOIN policies p ON i.policy_id = p.id
            WHERE p.owner_id = ANY(v_subtree)
            AND i.status = 'pending'
            AND i.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + interval '7 days'
        ),
        'new_policies_this_month', (
            SELECT COUNT(*)
            FROM policies
            WHERE owner_id = ANY(v_subtree)
            AND start_date >= v_month_start
            AND start_date <= v_month_end
        ),
        'new_customers_this_month', (
            SELECT COUNT(*)
            FROM customers
            WHERE owner_id = ANY(v_subtree)
            AND created_at >= v_month_start
            AND created_at < v_month_start + interval '1 month'
        )
    ) INTO v_result;
    
    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to get target progress
CREATE OR REPLACE FUNCTION get_target_progress(p_user_id uuid DEFAULT NULL, p_month date DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
    v_user_id uuid;
    v_month date;
    v_target decimal;
    v_achieved decimal;
    v_result jsonb;
BEGIN
    v_user_id := COALESCE(p_user_id, auth.uid());
    v_month := COALESCE(p_month, date_trunc('month', CURRENT_DATE)::date);
    
    SELECT target INTO v_target FROM users WHERE id = v_user_id;
    
    SELECT COALESCE(SUM(i.amount), 0) INTO v_achieved
    FROM installments i
    JOIN policies p ON i.policy_id = p.id
    WHERE p.owner_id = v_user_id
    AND i.is_first = true
    AND i.status = 'paid'
    AND i.paid_at >= v_month
    AND i.paid_at < v_month + interval '1 month';
    
    RETURN jsonb_build_object(
        'target', COALESCE(v_target, 0),
        'achieved', v_achieved,
        'percentage', CASE WHEN COALESCE(v_target, 0) > 0 THEN ROUND((v_achieved / v_target * 100)::numeric, 1) ELSE 0 END
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Function to get collection report
CREATE OR REPLACE FUNCTION get_collection_report(
    p_start_date date,
    p_end_date date,
    p_user_id uuid DEFAULT NULL
)
RETURNS TABLE (
    agent_id uuid,
    agent_name text,
    collected_amount decimal,
    payments_count bigint,
    new_production decimal
) AS $$
DECLARE
    v_user_id uuid;
    v_subtree uuid[];
BEGIN
    v_user_id := COALESCE(p_user_id, auth.uid());
    v_subtree := get_user_subtree(v_user_id);
    
    RETURN QUERY
    SELECT 
        u.id as agent_id,
        u.name as agent_name,
        COALESCE(SUM(CASE WHEN pay.is_cancelled = false THEN pay.amount ELSE 0 END), 0) as collected_amount,
        COUNT(CASE WHEN pay.is_cancelled = false THEN 1 END) as payments_count,
        COALESCE(SUM(CASE WHEN i.is_first = true AND pay.is_cancelled = false THEN pay.amount ELSE 0 END), 0) as new_production
    FROM users u
    LEFT JOIN policies p ON p.owner_id = u.id
    LEFT JOIN installments i ON i.policy_id = p.id
    LEFT JOIN payments pay ON pay.installment_id = i.id
        AND pay.payment_month >= p_start_date
        AND pay.payment_month <= p_end_date
    WHERE u.id = ANY(v_subtree)
    AND u.role IN ('agent', 'premium_agent')
    GROUP BY u.id, u.name
    ORDER BY collected_amount DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;
;
