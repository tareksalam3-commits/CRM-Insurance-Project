-- توسيع إشعارات استحقاق/إيقاف الأقساط لتصل لكل السلسلة الإدارية (وليس المدير المباشر فقط)
-- نفس منطق العمل تماماً (7 أيام قبل الاستحقاق، الإيقاف بعد overdue_months_to_suspend) بدون أي تغيير،
-- التغيير الوحيد هو نطاق التوزيع ليطابق صلاحيات النظام المطلوبة.
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
        PERFORM notify_users(
            get_user_ancestors(rec.owner_id), 'due_today', 'قسط مستحق اليوم',
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
        PERFORM notify_users(
            get_user_ancestors(rec.owner_id), 'due_this_week', 'قسط مستحق هذا الأسبوع',
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
            PERFORM notify_users(
                get_user_ancestors(rec.owner_id), 'policy_suspended', 'تم إيقاف الوصل تلقائياً',
                'تم إيقاف الوصل رقم ' || rec.policy_number || ' ل' || suspend_reason_text,
                'policy', rec.policy_id
            );
        END IF;
    END LOOP;
END;
$function$;

-- تذكير اقتراب موعد تقفيل الشهر: يُرسل لكل من له صلاحية التقفيل (مراقب فأعلى)
-- في آخر 3 أيام من الشهر إذا لم يُقفل الشهر الحالي بعد، مرة واحدة يومياً كحد أقصى.
CREATE OR REPLACE FUNCTION public.create_month_closing_reminders()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_current_month date := date_trunc('month', CURRENT_DATE)::date;
    v_days_left int := (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day')::date - CURRENT_DATE;
    v_recipients uuid[];
BEGIN
    IF v_days_left > 3 THEN RETURN; END IF;

    IF EXISTS (SELECT 1 FROM monthly_closings WHERE month = v_current_month AND is_open = false) THEN
        RETURN;
    END IF;

    IF EXISTS (
        SELECT 1 FROM notifications
        WHERE type = 'month_closing_upcoming'
        AND entity_type = 'monthly_closing'
        AND created_at::date = CURRENT_DATE
    ) THEN
        RETURN;
    END IF;

    SELECT array_agg(id) INTO v_recipients FROM users
    WHERE role IN ('supervisor', 'general_supervisor', 'development_manager', 'super_admin')
    AND deleted_at IS NULL;

    PERFORM notify_users(
        v_recipients, 'month_closing_upcoming', 'اقتراب موعد تقفيل الشهر',
        'يقترب موعد نهاية الشهر ولم يتم تقفيل الشهر الحالي بعد (متبقي ' || v_days_left || ' يوم)',
        'monthly_closing', NULL
    );
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_month_closing_reminders() FROM anon;

-- جدولة يومية: توليد إشعارات الاستحقاق/الإيقاف + تحديث حالة الأقساط المتأخرة + تذكير تقفيل الشهر
DO $$
BEGIN
    PERFORM cron.unschedule('create-due-notifications');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    PERFORM cron.unschedule('update-overdue-installments');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

DO $$
BEGIN
    PERFORM cron.unschedule('create-month-closing-reminders');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule('update-overdue-installments', '0 1 * * *', $$SELECT public.update_overdue_installments();$$);
SELECT cron.schedule('create-due-notifications',   '5 1 * * *', $$SELECT public.create_due_notifications();$$);
SELECT cron.schedule('create-month-closing-reminders', '10 1 * * *', $$SELECT public.create_month_closing_reminders();$$);
