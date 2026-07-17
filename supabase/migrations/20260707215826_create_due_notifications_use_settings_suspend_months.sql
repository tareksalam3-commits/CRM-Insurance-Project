CREATE OR REPLACE FUNCTION public.create_due_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    rec record;
    overdue_date int;
    suspend_months int;
    suspend_reason_text text;
BEGIN
    SELECT notification_days_before, overdue_months_to_suspend
    INTO overdue_date, suspend_months
    FROM settings LIMIT 1;

    IF overdue_date IS NULL THEN overdue_date := 7; END IF;
    IF suspend_months IS NULL THEN suspend_months := 2; END IF;

    suspend_reason_text := 'تأخر السداد أكثر من ' || suspend_months ||
        (CASE WHEN suspend_months = 1 THEN ' شهر' WHEN suspend_months = 2 THEN ' شهرين' ELSE ' أشهر' END);

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
        WHERE i.due_date < CURRENT_DATE - make_interval(months => suspend_months)
        AND i.status IN ('pending', 'overdue')
    LOOP
        UPDATE policies SET status = 'suspended', suspended_at = now(), suspended_reason = suspend_reason_text
        WHERE id = rec.policy_id AND status = 'active';

        UPDATE installments SET status = 'overdue', updated_at = now()
        WHERE id = rec.id AND status != 'overdue';

        IF NOT EXISTS (
            SELECT 1 FROM notifications n
            WHERE n.entity_id = rec.policy_id AND n.type = 'policy_suspended' AND n.user_id = rec.owner_id
        ) THEN
            INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
            VALUES (rec.owner_id, 'policy_suspended', 'تم إيقاف الوصل تلقائياً',
                'تم إيقاف الوصل رقم ' || rec.policy_number || ' ل' || suspend_reason_text, 'policy', rec.policy_id);

            IF rec.manager_id IS NOT NULL THEN
                INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
                VALUES (rec.manager_id, 'policy_suspended', 'تم إيقاف وصل تلقائياً',
                    'تم إيقاف الوصل رقم ' || rec.policy_number || ' ل' || suspend_reason_text, 'policy', rec.policy_id);
            END IF;
        END IF;
    END LOOP;
END;
$function$;
;
