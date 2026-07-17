-- [ملف مُعاد بناؤه من الحالة الفعلية لقاعدة البيانات الحية بتاريخ 2026-07-16
--  عبر Supabase MCP — لم يكن موجودًا فى نسخة المستودع الأصلية]
--
-- تعديل trigger function الخاصة بإلغاء السداد: بدل ما القسط يرجع "متأخر"
-- (overdue) فورًا بمجرد إلغاء سداده، بقى فيه فترة سماح شهر واحد من تاريخ
-- الاستحقاق قبل ما يتحول لمتأخر — عشان ميتصنفش القسط كمتأخر غلط لمجرد
-- إلغاء سداد حصل بالخطأ فى نفس الشهر.

CREATE OR REPLACE FUNCTION public.cancel_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE installments
    SET status = CASE
        WHEN due_date < CURRENT_DATE - interval '1 month' THEN 'overdue'::installment_status
        ELSE 'pending'::installment_status
    END,
        paid_at = NULL,
        updated_at = now()
    WHERE id = NEW.installment_id;
    RETURN NEW;
END;
$function$;
