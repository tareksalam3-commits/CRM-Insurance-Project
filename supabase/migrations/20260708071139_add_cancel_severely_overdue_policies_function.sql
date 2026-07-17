/*
دالة جديدة: تُلغي أي وثيقة (نشطة أو موقوفة) عندها قسط غير مسدد فات على تاريخ
استحقاقه 3 أشهر كاملة أو أكثر (بالتقويم، مش بعدّ أيام) — حسب طلب العميل:
- شهر واحد متأخر = يظهر في تبويب "المتأخر"
- شهرين متأخر = أقصى مدة يفضل فيها ظاهر في "المتأخر"
- 3 شهور متأخر = يخرج من "المتأخر" وتُلغى الوثيقة تلقائياً

تُستدعى من الواجهة كل مرة تُفتح فيها صفحة التحصيل (مفيش جدولة/cron، الفحص
بيحصل عند الاستخدام الفعلي بدل التوقيت الثابت).
*/
CREATE OR REPLACE FUNCTION public.cancel_severely_overdue_policies()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_current_month date := date_trunc('month', CURRENT_DATE)::date;
BEGIN
    UPDATE policies
    SET status = 'cancelled',
        updated_at = now()
    WHERE status IN ('active', 'suspended')
      AND id IN (
          SELECT DISTINCT i.policy_id
          FROM installments i
          WHERE i.status = 'pending'
            AND date_trunc('month', i.due_date)::date <= (v_current_month - interval '3 months')::date
      );
END;
$function$;
;
