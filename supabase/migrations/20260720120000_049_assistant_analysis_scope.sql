-- ============================================================================
-- 049_assistant_analysis_scope.sql
-- ----------------------------------------------------------------------------
-- الغرض: تعديل "نطاق التحليل" اللي بيعتمد عليه المساعد الذكي فقط، بحيث يكون
-- مبني على الدرجة الوظيفية للمستخدم بدل الاعتماد على ما هو معروض بالشاشة
-- الحالية أو على get_user_subtree (نفس الدالة المستخدمة فى صلاحيات النظام
-- وصلاحيات الصفحات عبر RLS).
--
-- مهم جداً: هذا الملف لا يعدّل ولا يحذف get_user_subtree ولا أي RLS policy
-- موجودة. كل الدوال هنا جديدة ومستقلة تماماً، وتُستخدم حصرياً من كود المساعد
-- الذكي (src/features/assistant/helpers/scopeHelpers.ts وما يعتمد عليه) —
-- باقي شاشات النظام لسه شغالة بنفس صلاحياتها القديمة زي ما هي بالظبط.
--
-- نطاق التحليل الجديد حسب الدرجة الوظيفية لصاحب الطلب:
--   وكيل / وسيط حر        → كل من هم داخل نفس "المراقبة" (subtree المراقب
--                              اللي هو تابعه: كل رؤساء المجموعات والوكلاء)
--   رئيس مجموعة              → كل من هم داخل نفس "المراقبة العامة" (subtree
--                              المراقب العام اللي هو تابعه)
--   مراقب / مراقب عام        → كل من هم داخل وحدة مدير التطوير اللي يتبعه
--   مدير تطوير                → وحدته بالكامل (نفسه + كل من تحته)
--   مدير فرع / Super Admin    → الفرع بالكامل
--
-- الدوال دي SECURITY DEFINER عشان تقدر تجمع بيانات النطاق الأوسع ده حتى لو
-- RLS العادي على الجداول (customers/policies/installments/payments/users)
-- كان هيقصر رؤية المستخدم على مرؤوسيه المباشرين بس. في المقابل، كل دالة منها
-- بترجع فقط الأعمدة اللازمة لتحليل المساعد (Context منظم)، مش كل أعمدة
-- الجدول، ومفيش أي مسار بيرجّع البيانات دي للواجهة خارج ميزة المساعد نفسها.
--
-- أمان: كل الدوال دي بتاخد هوية المستخدم من auth.uid() داخلياً فقط (مفيش أي
-- باراميتر user_id قابل للتمرير من الـ Client) - عشان محدش يقدر يستدعيها
-- بمعرّف مستخدم تاني ويوسّع نطاقه بنفسه.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- دالة مساعدة داخلية: تطلع لأعلى فى سلسلة manager_id بدءاً من مستخدم معيّن
-- لحد ما تلاقي أول سلف بدرجة وظيفية معيّنة (مثلاً: أول "مراقب" فوق وكيل).
-- لو مفيش سلف بالدرجة المطلوبة (حالة استثنائية فى الهيكل التنظيمي)، بترجع
-- أعلى نقطة موجودة فعليًا فى السلسلة (بدل NULL) كحد أقصى آمن.
-- غير متاحة للاستدعاء المباشر من الـ Client (بدون GRANT لـ authenticated) -
-- تُستخدم فقط داخلياً من get_assistant_scope_ids فى نفس الملف.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION find_ancestor_by_role(p_start_id uuid, p_target_role user_role)
RETURNS uuid AS $$
DECLARE
    v_result uuid;
BEGIN
    WITH RECURSIVE up_chain AS (
        SELECT id, manager_id, role, 0 AS depth FROM users WHERE id = p_start_id
        UNION ALL
        SELECT u.id, u.manager_id, u.role, uc.depth + 1
        FROM users u
        INNER JOIN up_chain uc ON u.id = uc.manager_id
    )
    SELECT id INTO v_result FROM up_chain WHERE role = p_target_role ORDER BY depth ASC LIMIT 1;

    IF v_result IS NOT NULL THEN
        RETURN v_result;
    END IF;

    WITH RECURSIVE up_chain AS (
        SELECT id, manager_id, 0 AS depth FROM users WHERE id = p_start_id
        UNION ALL
        SELECT u.id, u.manager_id, uc.depth + 1
        FROM users u
        INNER JOIN up_chain uc ON u.id = uc.manager_id
    )
    SELECT id INTO v_result FROM up_chain ORDER BY depth DESC LIMIT 1;

    RETURN COALESCE(v_result, p_start_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

REVOKE EXECUTE ON FUNCTION find_ancestor_by_role(uuid, user_role) FROM PUBLIC;

-- ----------------------------------------------------------------------------
-- نقطة الدخول الأساسية: نطاق التحليل الخاص بالمستخدم الحالي (auth.uid())
-- حسب درجته الوظيفية، زي ما هو موضّح فى تعليق أعلى الملف.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_assistant_scope_ids()
RETURNS uuid[] AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_role user_role;
    v_root uuid;
BEGIN
    IF v_user_id IS NULL THEN
        RETURN ARRAY[]::uuid[];
    END IF;

    SELECT role INTO v_role FROM users WHERE id = v_user_id;
    IF v_role IS NULL THEN
        RETURN ARRAY[v_user_id];
    END IF;

    IF v_role = 'super_admin' THEN
        -- مدير الفرع / Super Admin: كل بيانات الفرع بالكامل
        RETURN COALESCE((SELECT array_agg(id) FROM users), ARRAY[v_user_id]);
    ELSIF v_role = 'development_manager' THEN
        -- مدير التطوير: كل بيانات الوحدات التابعة له بالكامل (نفسه + الكل تحته)
        v_root := v_user_id;
    ELSIF v_role IN ('supervisor', 'general_supervisor') THEN
        -- المراقب / المراقب العام: كل ما يتبع نفس مدير التطوير
        v_root := find_ancestor_by_role(v_user_id, 'development_manager');
    ELSIF v_role = 'group_leader' THEN
        -- رئيس المجموعة: كل ما يتبع نفس المراقبة العامة
        v_root := find_ancestor_by_role(v_user_id, 'general_supervisor');
    ELSIF v_role IN ('agent', 'premium_agent') THEN
        -- الوكيل: كل ما يتبع نفس المراقبة
        v_root := find_ancestor_by_role(v_user_id, 'supervisor');
    ELSE
        v_root := v_user_id;
    END IF;

    RETURN get_user_subtree(v_root);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_assistant_scope_ids() TO authenticated;

-- ----------------------------------------------------------------------------
-- دوال جلب بيانات مُجهّزة (SECURITY DEFINER) للمساعد الذكي فقط - كل واحدة
-- منها بترجع الأعمدة اللازمة فقط ومفلترة على get_assistant_scope_ids()
-- تلقائياً جوه القاعدة، بدل ما نرجّع نطاق ID أوسع للـ Client ونسيبه يفلتر
-- بيانات كان RLS العادي مكانش هيوريهاله أصلاً.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION assistant_scoped_users()
RETURNS TABLE (
    id uuid,
    name text,
    role user_role,
    target decimal,
    manager_id uuid,
    is_active boolean
) AS $$
    SELECT u.id, u.name, u.role, u.target, u.manager_id, u.is_active
    FROM users u
    WHERE u.id = ANY (get_assistant_scope_ids());
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION assistant_scoped_users() TO authenticated;

CREATE OR REPLACE FUNCTION assistant_scoped_payments(
    p_payment_month date DEFAULT NULL,
    p_payment_month_gte date DEFAULT NULL,
    p_paid_at_gte timestamptz DEFAULT NULL,
    p_paid_at_lte timestamptz DEFAULT NULL
)
RETURNS TABLE (
    amount decimal,
    is_cancelled boolean,
    paid_at timestamptz,
    payment_month date,
    is_first boolean,
    owner_id uuid
) AS $$
    SELECT pay.amount, pay.is_cancelled, pay.paid_at, pay.payment_month, i.is_first, p.owner_id
    FROM payments pay
    INNER JOIN installments i ON pay.installment_id = i.id
    INNER JOIN policies p ON i.policy_id = p.id
    WHERE p.owner_id = ANY (get_assistant_scope_ids())
      AND pay.is_cancelled = false
      AND (p_payment_month IS NULL OR pay.payment_month = p_payment_month)
      AND (p_payment_month_gte IS NULL OR pay.payment_month >= p_payment_month_gte)
      AND (p_paid_at_gte IS NULL OR pay.paid_at >= p_paid_at_gte)
      AND (p_paid_at_lte IS NULL OR pay.paid_at <= p_paid_at_lte);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION assistant_scoped_payments(date, date, timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION assistant_scoped_policies(
    p_created_from timestamptz DEFAULT NULL,
    p_created_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    owner_id uuid,
    status policy_status,
    cancelled_at timestamptz,
    created_at timestamptz,
    policy_number text,
    premium_amount decimal,
    customer_id uuid,
    customer_name text
) AS $$
    SELECT p.id, p.owner_id, p.status, p.cancelled_at, p.created_at, p.policy_number,
           p.premium_amount, p.customer_id, c.name
    FROM policies p
    LEFT JOIN customers c ON c.id = p.customer_id
    WHERE p.owner_id = ANY (get_assistant_scope_ids())
      AND (p_created_from IS NULL OR p.created_at >= p_created_from)
      AND (p_created_to IS NULL OR p.created_at <= p_created_to);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION assistant_scoped_policies(timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION assistant_scoped_customers(
    p_created_from timestamptz DEFAULT NULL,
    p_created_to timestamptz DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    owner_id uuid,
    name text,
    phone text,
    national_id text,
    created_at timestamptz
) AS $$
    SELECT c.id, c.owner_id, c.name, c.phone, c.national_id, c.created_at
    FROM customers c
    WHERE c.owner_id = ANY (get_assistant_scope_ids())
      AND (p_created_from IS NULL OR c.created_at >= p_created_from)
      AND (p_created_to IS NULL OR c.created_at <= p_created_to);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION assistant_scoped_customers(timestamptz, timestamptz) TO authenticated;

CREATE OR REPLACE FUNCTION assistant_scoped_installments(
    p_status installment_status DEFAULT NULL,
    p_due_date date DEFAULT NULL
)
RETURNS TABLE (
    id uuid,
    amount decimal,
    status installment_status,
    due_date date,
    owner_id uuid,
    customer_id uuid,
    customer_name text
) AS $$
    SELECT i.id, i.amount, i.status, i.due_date, p.owner_id, p.customer_id, c.name
    FROM installments i
    INNER JOIN policies p ON i.policy_id = p.id
    LEFT JOIN customers c ON c.id = p.customer_id
    WHERE p.owner_id = ANY (get_assistant_scope_ids())
      AND (p_status IS NULL OR i.status = p_status)
      AND (p_due_date IS NULL OR i.due_date = p_due_date);
$$ LANGUAGE sql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION assistant_scoped_installments(installment_status, date) TO authenticated;
