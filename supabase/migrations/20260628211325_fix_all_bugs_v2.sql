-- ================================================================
-- MIGRATION: Fix All Identified Bugs
-- ================================================================

-- FIX 1: generate_installments - ON CONFLICT DO NOTHING prevents UNIQUE violation
CREATE OR REPLACE FUNCTION public.generate_installments(
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
            policy_id, installment_number, amount, due_date, is_first
        ) VALUES (
            p_policy_id, v_installment_number, p_premium_amount, v_due_date, v_installment_number = 1
        )
        ON CONFLICT (policy_id, installment_number) DO NOTHING;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- FIX 2: regenerate_installments trigger function
CREATE OR REPLACE FUNCTION public.regenerate_installments()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.start_date IS DISTINCT FROM NEW.start_date
       OR OLD.payment_method IS DISTINCT FROM NEW.payment_method
       OR OLD.premium_amount IS DISTINCT FROM NEW.premium_amount THEN

        DELETE FROM installments
        WHERE policy_id = NEW.id
        AND status = 'pending';

        PERFORM generate_installments(
            NEW.id, NEW.start_date, NEW.payment_method, NEW.premium_amount
        );
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- FIX 3: create_due_notifications - remove supervisor-only restriction
CREATE OR REPLACE FUNCTION public.create_due_notifications()
RETURNS void AS $$
DECLARE
    rec record;
    overdue_date int;
BEGIN
    SELECT notification_days_before INTO overdue_date FROM settings LIMIT 1;
    IF overdue_date IS NULL THEN overdue_date := 7; END IF;

    FOR rec IN
        SELECT DISTINCT i.*, p.policy_number, c.name as customer_name, p.owner_id
        FROM installments i
        JOIN policies p ON i.policy_id = p.id
        JOIN customers c ON p.customer_id = c.id
        WHERE i.due_date = CURRENT_DATE
        AND i.status = 'pending'
        AND NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.entity_id = i.id AND n.type = 'due_today' AND n.user_id = p.owner_id
        )
    LOOP
        INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
        VALUES (
            rec.owner_id, 'due_today', 'قسط مستحق اليوم',
            'القسط رقم ' || rec.installment_number || ' للوصل رقم ' || rec.policy_number || ' للعميل ' || rec.customer_name || ' مستحق اليوم',
            'installment', rec.id
        );
    END LOOP;

    FOR rec IN
        SELECT DISTINCT i.*, p.policy_number, c.name as customer_name, p.owner_id
        FROM installments i
        JOIN policies p ON i.policy_id = p.id
        JOIN customers c ON p.customer_id = c.id
        WHERE i.due_date BETWEEN CURRENT_DATE + interval '1 day' AND CURRENT_DATE + overdue_date
        AND i.status = 'pending'
        AND NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.entity_id = i.id AND n.type = 'due_this_week' AND n.user_id = p.owner_id
        )
    LOOP
        INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
        VALUES (
            rec.owner_id, 'due_this_week', 'قسط مستحق هذا الأسبوع',
            'القسط رقم ' || rec.installment_number || ' للوصل رقم ' || rec.policy_number || ' للعميل ' || rec.customer_name || ' مستحق في ' || to_char(rec.due_date, 'DD/MM/YYYY'),
            'installment', rec.id
        );
    END LOOP;

    FOR rec IN
        SELECT DISTINCT i.*, p.policy_number, c.name as customer_name, p.owner_id, u.manager_id
        FROM installments i
        JOIN policies p ON i.policy_id = p.id
        JOIN customers c ON p.customer_id = c.id
        JOIN users u ON p.owner_id = u.id
        WHERE i.due_date < CURRENT_DATE - interval '2 months'
        AND i.status IN ('pending', 'overdue')
    LOOP
        UPDATE policies SET status = 'suspended', suspended_at = now(), suspended_reason = 'تأخر السداد أكثر من شهرين'
        WHERE id = rec.policy_id AND status = 'active';

        UPDATE installments SET status = 'overdue', updated_at = now()
        WHERE id = rec.id AND status != 'overdue';

        IF NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.entity_id = rec.policy_id AND n.type = 'policy_suspended' AND n.user_id = rec.owner_id
        ) THEN
            INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
            VALUES (rec.owner_id, 'policy_suspended', 'تم إيقاف الوصل تلقائياً',
                'تم إيقاف الوصل رقم ' || rec.policy_number || ' لتأخر السداد أكثر من شهرين', 'policy', rec.policy_id);

            IF rec.manager_id IS NOT NULL THEN
                INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
                VALUES (rec.manager_id, 'policy_suspended', 'تم إيقاف وصل تلقائياً',
                    'تم إيقاف الوصل رقم ' || rec.policy_number || ' لتأخر السداد أكثر من شهرين', 'policy', rec.policy_id);
            END IF;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- FIX 4: is_month_closed - cleaner implementation
CREATE OR REPLACE FUNCTION public.is_month_closed(check_month date)
RETURNS boolean AS $$
DECLARE
    v_is_closed boolean;
BEGIN
    SELECT (is_open = false) INTO v_is_closed
    FROM monthly_closings
    WHERE month = date_trunc('month', check_month)::date;
    RETURN COALESCE(v_is_closed, false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- FIX 5: update_overdue_installments is accessible
CREATE OR REPLACE FUNCTION public.update_overdue_installments()
RETURNS void AS $$
BEGIN
    UPDATE installments SET status = 'overdue', updated_at = now()
    WHERE status = 'pending' AND due_date < CURRENT_DATE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
;
