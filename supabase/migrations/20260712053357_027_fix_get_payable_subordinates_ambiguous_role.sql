/*
# تصحيح: خطأ "column reference role is ambiguous" في get_payable_subordinates

هذا هو السبب الحقيقي وراء ظهور "تعذر تحميل بيانات الاشتراك" في قسم الاشتراك
بالملف الشخصي لكل المستخدمين تقريباً. الدالة عندها عمود إخراج اسمه role
(في RETURNS TABLE)، وجوه جسم الدالة فيه شرط EXISTS بيستخدم role من غير
تأهيل (بدون اسم الجدول)، فـ PostgreSQL كان بيلخبط بين عمود الإخراج وعمود
الجدول ويرمي خطأ 42702 كل مرة تتنادى فيها الدالة — يعني طلب
fetchPayableSubordinates كان بيفشل دايماً، وده كان بيسقط كل الـ Promise.all
في SubscriptionTab فيرجع "تعذر تحميل بيانات الاشتراك" حتى لو باقي البيانات
(الاشتراك نفسه والإعدادات) موجودة وسليمة فعلاً.

الحل: تأهيل العمود بالكامل (users.role) جوه شرط الـ EXISTS.
*/

CREATE OR REPLACE FUNCTION get_payable_subordinates(p_payer_id uuid)
RETURNS TABLE(
    user_id uuid, name text, role user_role, manager_id uuid,
    is_active boolean, subscription_status subscription_status,
    current_period_end date, is_trial_used boolean
) AS $$
BEGIN
    IF p_payer_id <> auth.uid() AND NOT EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND users.role = 'super_admin'
    ) THEN
        RAISE EXCEPTION 'غير مصرح';
    END IF;

    RETURN QUERY
    SELECT u.id, u.name, u.role, u.manager_id, u.is_active,
           s.status, s.current_period_end, s.is_trial_used
    FROM users u
    JOIN subscriptions s ON s.user_id = u.id
    WHERE u.id = ANY (get_user_subtree(p_payer_id))
      AND u.id <> p_payer_id
      AND u.role IN ('development_manager', 'general_supervisor', 'supervisor', 'group_leader');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_payable_subordinates(uuid) TO authenticated;
