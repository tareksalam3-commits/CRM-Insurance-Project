/*
إلغاء ميزة "إيقاف الوثيقة" من النظام بالكامل — بناءً على طلب صريح: الحالات
المتاحة للوثيقة بقت بس "نشطة" و"ملغاة" (بدون حالة وسيطة "موقوفة").

هذا الملف بيعمل حاجتين:
1) تحويل أي وثيقة موقوفة حالياً إلى "نشطة" تلقائياً (تصحيح البيانات القائمة).
2) تعديل دالة create_due_notifications() (اللي بتشتغل يومياً عبر pg_cron الساعة
   1:05 صباحاً) عشان توقف عن إيقاف الوثائق تلقائياً عند التأخر — كانت هي
   المصدر الوحيد لإنشاء وثائق "موقوفة" جديدة غير الزر اليدوي فى الواجهة (اللي
   اتشال من الواجهة فى نفس هذا التحديث). باقي وظائف الدالة (إشعارات الاستحقاق
   اليوم / هذا الأسبوع، وتحديث حالة القسط لـ overdue) اتسابت زي ما هي بالظبط.

ملحوظة: النوع policy_status فى قاعدة البيانات لسه فيه القيمة 'suspended' فنياً
(Postgres مبيسمحش بحذف قيمة من ENUM بسهولة/بأمان)، لكن مفيش أي مسار فى النظام
بعد كده هيحط الحالة دي على أي وثيقة، فعملياً الحالة بقت غير مستخدمة إطلاقاً.
*/

-- 1) تحويل أي وثيقة موقوفة حالياً إلى نشطة
UPDATE policies
SET status = 'active',
    suspended_at = NULL,
    suspended_reason = NULL,
    updated_at = now()
WHERE status = 'suspended';

-- 2) تعديل الدالة اليومية عشان توقف عن إيقاف الوثائق تلقائياً
CREATE OR REPLACE FUNCTION public.create_due_notifications()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    rec record;
    overdue_date int;
BEGIN
    SELECT notification_days_before
    INTO overdue_date
    FROM settings LIMIT 1;

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

    -- ملحوظة: كان هنا سابقاً حلقة ثالثة بتوقف الوثيقة تلقائياً (status='suspended')
    -- بعد تأخر مُعتمد على إعداد overdue_months_to_suspend — اتشالت بالكامل ضمن
    -- إلغاء ميزة "إيقاف الوثيقة". تحديث حالة القسط لـ overdue وإلغاء الوثائق
    -- المتأخرة جداً (3 شهور فأكثر) بيتم من مكان تاني بالفعل (دالة
    -- cancel_severely_overdue_policies، بتتنفذ عند فتح صفحة التحصيل).
END;
$function$;
