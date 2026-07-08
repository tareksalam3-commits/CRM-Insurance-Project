/*
# Fix Missing Enum Value - Migration 012

## Context
تدقيق سابق على نسخة قديمة من هذا المجلد المحلي (local repo) ظنّ أن الدوال
delete_policy_safe و get_email_by_phone مفقودتان بالكامل. بعد المقارنة المباشرة
مع قاعدة الإنتاج الفعلية على Supabase تبيّن أن هذا المجلد المحلي كان متأخراً
كثيراً عن الإنتاج (12 migration محلياً مقابل 37 migration مطبّقة فعلياً على
الخادم)، وأن كلتا الدالتين، وكذلك can_delete_policy، موجودتان بالفعل وتعملان
بشكل صحيح في الإنتاج (تم التحقق مباشرة عبر قراءة تعريفهما الفعلي). لذلك تم
إلغاء الخطة الأصلية لإعادة إنشائهما هنا تجنباً لاستبدال نسخة الإنتاج الصحيحة
بنسخة قد تختلف عنها.

الشيء الوحيد الذي تأكد أنه لا يزال ناقصاً فعلياً هو القيمة 'policy_delete' في
enum الخاص بـ action_type (الكود يستدعيها بالفعل عند تسجيل نشاط حذف الوثيقة،
لكنها لم تكن مضافة لقيم الـ enum). هذا التصحيح تم تطبيقه مباشرة على قاعدة
الإنتاج (مشروع insurance-crm) بتاريخ اليوم.
*/

ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'policy_delete';

-- الدالة التالية كانت الوحيدة المتبقية بدون SET search_path رغم أن كل الدوال
-- الأخرى تم تحصينها بالفعل بنفس الطريقة في نسخة الإنتاج؛ نفس المنطق تماماً،
-- إضافة فقط لسطر search_path.
CREATE OR REPLACE FUNCTION public.update_overdue_installments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE installments SET status = 'overdue', updated_at = now()
    WHERE status = 'pending' AND due_date < CURRENT_DATE - interval '1 month';
END;
$function$;

/*
## Follow-up fixes (same day) — applied directly to production after review

1. create_due_notifications(): كانت تستخدم interval '2 months' ثابت بدل قراءة
   settings.overdue_months_to_suspend، فتغيير هذا الإعداد من صفحة الإعدادات
   ما كان له أي تأثير فعلي. تم تعديلها لتقرأ القيمة من settings (بقيمة
   افتراضية 2 لو الإعداد فارغ)، وتوليد نص السبب/الإشعار ديناميكياً بدل النص
   الثابت "أكثر من شهرين".

2. storage.objects: تم حذف سياسة SELECT العامة "avatars_public_read" الخاصة
   بـ bucket "profiles". الـ bucket نفسه public=true، فعرض الصور عبر
   getPublicUrl يستمر يعمل بشكل طبيعي بدون أي سياسة RLS (الوصول عبر الرابط
   العام لا يمر أصلاً عبر RLS). السياسة المحذوفة كانت تسمح فقط باستخدام واجهة
   Storage API (list()) لسرد/عدّ كل الملفات في الـ bucket، وهو استخدام غير
   موجود في كود الواجهة أصلاً.
*/

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

DROP POLICY IF EXISTS "avatars_public_read" ON storage.objects;
