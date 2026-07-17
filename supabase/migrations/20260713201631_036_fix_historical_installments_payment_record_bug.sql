-- [ملف مُعاد بناؤه من الحالة الفعلية لقاعدة البيانات الحية بتاريخ 2026-07-16
--  عبر Supabase MCP — لم يكن موجودًا فى نسخة المستودع الأصلية]
--
-- إصلاح: mark_historical_installments_paid كانت بتحدث حالة القسط لمسدد
-- (paid) دون إنشاء سجل سداد (payments) فعلي، مما يسبب عدم ظهورها فى
-- تقارير التحصيل رغم اعتبارها "مسددة". الإصلاح: توليد صف payments مطابق
-- لكل قسط تاريخي يتم تحديده، بعلامة is_historical = true.
--
-- ملحوظة: هذه النسخة تضيف باراميتر p_paid_by_user_id اختياري (بدل استخدام
-- auth.uid() فقط) عشان تشتغل صح لما تُستدعى من create_policy_op فى سياق
-- المستخدم اللي أنشأ الوثيقة تحديدًا.

CREATE OR REPLACE FUNCTION public.mark_historical_installments_paid(
    p_policy_id uuid,
    p_paid_by_user_id uuid DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_actor uuid;
BEGIN
    SELECT COALESCE(p_paid_by_user_id, auth.uid(), owner_id) INTO v_actor
    FROM policies WHERE id = p_policy_id;

    WITH updated AS (
        UPDATE installments
        SET status = 'paid',
            paid_at = due_date::timestamptz,
            is_historical = true,
            updated_at = now()
        WHERE policy_id = p_policy_id
          AND status = 'pending'
          AND due_date < date_trunc('month', CURRENT_DATE)::date
        RETURNING id, amount, due_date, paid_at
    )
    INSERT INTO payments (installment_id, amount, paid_by_user_id, paid_at, payment_month, is_historical)
    SELECT id, amount, v_actor, paid_at, date_trunc('month', due_date)::date, true
    FROM updated;
END;
$function$;
