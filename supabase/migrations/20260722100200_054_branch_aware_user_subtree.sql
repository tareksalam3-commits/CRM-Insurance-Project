-- المرحلة الثانية من دعم "تعدد الفروع": تفعيل "سياق الفرع" فى الصلاحيات،
-- بشكل متوافق تمامًا مع الخلف (backward-compatible) مع get_user_subtree
-- الحالية ومع كل الـ RLS policies المعتمدة عليها.
--
-- ==================== ملاحظة فنية مهمة (ليه فى دالة جديدة بدل تعديل
-- get_user_subtree نفسها بباراميتر اختياري؟) ====================
-- كان المطلوب الأصلي إضافة باراميتر اختياري (branch_id uuid default null)
-- لنفس دالة get_user_subtree(uuid). تم اختبار هذا الأسلوب فعليًا على قاعدة
-- بيانات تجريبية (functions + policy تجريبيين) قبل كتابة الملف ده، وثبت
-- إنه غير آمن للسببين التاليين:
--
--   1) لو ضفنا get_user_subtree(user_id uuid, branch_id uuid DEFAULT NULL)
--      كدالة تانية بجانب get_user_subtree(user_id uuid) الحالية (زي ما
--      PostgreSQL بيتعامل مع أي دالة بعدد باراميترات مختلف كـ "overload"
--      منفصل تمامًا، مش استبدال) — بيبقى فيه دالتين بنفس الاسم ممكن
--      تتطابقا مع نداء بباراميتر واحد بس، وPostgreSQL بيرفض الاختيار بينهم
--      برسالة "function get_user_subtree(...) is not unique" — سواء كان
--      النداء positional (get_user_subtree(uid)) أو named
--      (get_user_subtree(user_id => uid), وهو بالظبط الأسلوب المستخدم فعليًا
--      فى فرونت إند المشروع عبر .rpc('get_user_subtree', { user_id })).
--      يعنى ببساطة: أي إضافة overload بنفس الاسم كانت هتكسر كل نداء حالي
--      للدالة فورًا (soft break)، وهو عكس الهدف من المرحلة دي تمامًا.
--
--   2) الطريق الوحيد لإبقاء اسم get_user_subtree واحد قابل لباراميتر
--      اختياري فعلاً هو: حذف الدالة الحالية (DROP) وإعادة إنشائها بنفس
--      الاسم بباراميترين. لكن DROP FUNCTION get_user_subtree(uuid) يفشل
--      مباشرة (أو يحتاج CASCADE) لأن 21 RLS policy على 8 جداول مختلفة
--      (activity_logs, customers, daily_reports, installments, payments,
--      policies, subscriptions, users, year2_payments) بتعتمد عليها
--      مباشرة داخل USING/WITH CHECK — CASCADE كان هيحذفهم كلهم ويحتاج
--      إعادة إنشاء كل واحدة فيهم بالظبط بنفس التعريف، وهي مخاطرة
--      وتعقيد غير مبرر مقابل صفر فايدة حقيقية (لأن السلوك الحالي
--      المعتمد على manager_id أصلاً "عابر للفروع" فعليًا — راجع الشرح
--      فى نهاية الملف تحت "لماذا لا حاجة لتعديل أي RLS policy").
--
-- الحل الآمن: دالة جديدة بالكامل باسم مختلف (get_user_subtree_branch_aware)
-- تحقق بالضبط المطلوب سلوكيًا (باراميتر branch_id اختياري، NULL = نفس
-- سلوك get_user_subtree الحالي بالظبط، بدون أي تعديل أو DROP على الدالة
-- الأصلية ولا أي RLS policy قائمة) — additive-only بالكامل زي فلسفة
-- المرحلة الأولى (052/053).
-- ====================================================================

CREATE OR REPLACE FUNCTION get_user_subtree_branch_aware(user_id uuid, branch_id uuid DEFAULT NULL)
RETURNS uuid[] AS $$
DECLARE
    result uuid[];
BEGIN
    -- branch_id = NULL: نفس السلوك الحالي بالظبط (نعتمد على الدالة الأصلية
    -- غير المعدَّلة، اللي بتمشي فى السلسلة بالاعتماد على users.manager_id).
    IF branch_id IS NULL THEN
        RETURN get_user_subtree(user_id);
    END IF;

    -- branch_id مُمرّر: نمشي فى السلسلة بالاعتماد على user_branch_roles
    -- المرتبطة بنفس الفرع (manager_id هنا هو عمود user_branch_roles.manager_id
    -- الخاص بنفس الفرع، مش users.manager_id العام).
    WITH RECURSIVE user_tree AS (
        SELECT ubr.user_id AS id
        FROM user_branch_roles ubr
        WHERE ubr.user_id = get_user_subtree_branch_aware.user_id
          AND ubr.branch_id = get_user_subtree_branch_aware.branch_id
        UNION ALL
        SELECT ubr2.user_id
        FROM user_branch_roles ubr2
        INNER JOIN user_tree ut ON ubr2.manager_id = ut.id
        WHERE ubr2.branch_id = get_user_subtree_branch_aware.branch_id
    )
    SELECT array_agg(id) INTO result FROM user_tree;

    RETURN COALESCE(result, ARRAY[user_id]);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

REVOKE EXECUTE ON FUNCTION get_user_subtree_branch_aware(uuid, uuid) FROM anon;

-- ==================== لماذا لا حاجة لتعديل أي RLS policy حالية ====================
-- كل الـ 21 policy الحالية (على activity_logs, customers, daily_reports,
-- installments, payments, policies, subscriptions, users, year2_payments)
-- بتنادي get_user_subtree(auth.uid()) بباراميتر واحد بس، وهتفضل كده بدون
-- أي تعديل فى الملف ده — أي هتفضل تستخدم الدالة الأصلية غير المعدَّلة تمامًا.
--
-- ودي بالظبط النتيجة المطلوبة فى البند 2 من المهمة: مدير عنده أكتر من وضع
-- وظيفي (أكتر من صف فى user_branch_roles فى فروع مختلفة) لازم يفضل شايف
-- "اتحاد" كل فرقه فى كل فروعه. الدالة الأصلية get_user_subtree الحالية
-- بتمشي فى السلسلة بالاعتماد على users.manager_id (عمود واحد عام، مش
-- مرتبط بفرع معين أصلاً) — فهي أصلاً لا تفلتر برانش بعينه، ونتيجتها
-- بالفعل "عابرة للفروع" (تشمل كل من تحت المستخدم بغض النظر عن الفرع).
-- بالتالي أي RLS policy بتستخدمها حاليًا لا تخسر أي رؤية كانت متاحة قبل
-- هذه المرحلة، ولا تحتاج أي UNION إضافي — الـ "اتحاد" متحقق ضمنيًا من
-- تصميم الدالة الأصلية نفسها.
--
-- get_user_subtree_branch_aware(uid, branch_id) الجديدة مُعدة للاستخدام
-- المستقبلي (المرحلة الثالثة: حاسبات/تقارير عايزة تتفلتر بفرع معين تحديدًا)
-- ومش مستخدمة من أي RLS policy فى هذه المرحلة، وده مقصود.
-- ====================================================================
