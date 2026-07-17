CREATE OR REPLACE FUNCTION public.auto_cancel_overdue_policies()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_count integer := 0;
    rec record;
BEGIN
    FOR rec IN
        SELECT p.id AS policy_id, MIN(i.due_date) AS oldest_unpaid_due_date
        FROM policies p
        JOIN installments i ON i.policy_id = p.id
        WHERE p.status = 'active'
          AND i.status IN ('pending', 'overdue')
        GROUP BY p.id
        HAVING MIN(i.due_date) <= (CURRENT_DATE - interval '3 months')::date
    LOOP
        UPDATE policies
        SET status = 'cancelled',
            cancelled_at = (rec.oldest_unpaid_due_date + interval '3 months')::timestamptz,
            updated_at = now()
        WHERE id = rec.policy_id;

        v_count := v_count + 1;
    END LOOP;

    RETURN v_count;
END;
$function$;

COMMENT ON FUNCTION public.auto_cancel_overdue_policies() IS
'تُنفَّذ يومياً عبر pg_cron: أي وثيقة نشطة مرّ على أقدم قسط غير مسدد فيها 3 أشهر كاملة بدون سداد تتحول تلقائياً لحالة cancelled، بتاريخ إلغاء = تاريخ استحقاق أقدم قسط + 3 أشهر (وليس وقت تنفيذ المهمة). لا تسجيل نشاط لعدم وجود مستخدم مسجّل دخوله وقت التنفيذ (auth.uid() فارغ في سياق cron)، والإلغاء اليدوي يستمر يعمل بشكل طبيعي ومنفصل تماماً.';

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

DO $$
BEGIN
    PERFORM cron.unschedule('auto-cancel-overdue-policies');
EXCEPTION WHEN OTHERS THEN
    NULL;
END $$;

SELECT cron.schedule(
    'auto-cancel-overdue-policies',
    '0 2 * * *',
    $$SELECT public.auto_cancel_overdue_policies();$$
);
;
