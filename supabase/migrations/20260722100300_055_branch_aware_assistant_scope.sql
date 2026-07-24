-- ملاحظة مزامنة (تم استبدال هذا الملف بالكامل عند مزامنة الريبو مع قاعدة
-- البيانات الفعلية): كان فى الريبو نسخة مسودة باسم قريب
-- (055_assistant_analysis_scope_branch_aware.sql) تعتمد على دوال مختلفة
-- تمامًا (assistant_primary_branch_id + find_ancestor_by_role بـ 3
-- باراميترات + get_assistant_scope_ids يعتمد على "الفرع الأساسي" فقط) —
-- هذه المسودة لم تُطبَّق فعليًا على قاعدة البيانات أبدًا. المحتوى الحقيقي
-- المطبّق فعليًا هو ده تحت، واللي بيخلي get_assistant_scope_ids تدور على
-- *كل* الفروع اللي المستخدم عضو فيها (مش الأساسي بس) وتجمع نطاق كل فرع
-- على حدة بدل الاكتفاء بفرع واحد — وده الصح لمدير عنده أكثر من وضع وظيفي.

-- نفس فكرة migration 054 (get_user_subtree_branch_aware) بالظبط، لكن
-- لمسار "نطاق تحليل المساعد" المستقل عمدًا عن get_user_subtree (migration
-- 049: get_assistant_scope_ids + find_ancestor_by_role).

CREATE OR REPLACE FUNCTION find_ancestor_by_role_branch_aware(
    p_start_id uuid,
    p_branch_id uuid,
    p_target_role user_role
)
RETURNS uuid AS $$
DECLARE
    v_result uuid;
BEGIN
    WITH RECURSIVE up_chain AS (
        SELECT user_id AS id, manager_id, role, 0 AS depth
        FROM user_branch_roles
        WHERE user_id = p_start_id AND branch_id = p_branch_id
        UNION ALL
        SELECT ubr.user_id, ubr.manager_id, ubr.role, uc.depth + 1
        FROM user_branch_roles ubr
        INNER JOIN up_chain uc ON ubr.user_id = uc.manager_id
        WHERE ubr.branch_id = p_branch_id
    )
    SELECT id INTO v_result FROM up_chain WHERE role = p_target_role ORDER BY depth ASC LIMIT 1;

    IF v_result IS NOT NULL THEN
        RETURN v_result;
    END IF;

    WITH RECURSIVE up_chain AS (
        SELECT user_id AS id, manager_id, 0 AS depth
        FROM user_branch_roles
        WHERE user_id = p_start_id AND branch_id = p_branch_id
        UNION ALL
        SELECT ubr.user_id, ubr.manager_id, uc.depth + 1
        FROM user_branch_roles ubr
        INNER JOIN up_chain uc ON ubr.user_id = uc.manager_id
        WHERE ubr.branch_id = p_branch_id
    )
    SELECT id INTO v_result FROM up_chain ORDER BY depth DESC LIMIT 1;

    RETURN COALESCE(v_result, p_start_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

REVOKE EXECUTE ON FUNCTION find_ancestor_by_role_branch_aware(uuid, uuid, user_role) FROM PUBLIC;

CREATE OR REPLACE FUNCTION get_assistant_scope_ids()
RETURNS uuid[] AS $$
DECLARE
    v_user_id uuid := auth.uid();
    v_global_role user_role;
    v_branch_row RECORD;
    v_root uuid;
    v_result uuid[] := ARRAY[]::uuid[];
BEGIN
    IF v_user_id IS NULL THEN
        RETURN ARRAY[]::uuid[];
    END IF;

    SELECT role INTO v_global_role FROM users WHERE id = v_user_id;
    IF v_global_role IS NULL THEN
        RETURN ARRAY[v_user_id];
    END IF;

    IF v_global_role = 'super_admin' THEN
        RETURN COALESCE((SELECT array_agg(id) FROM users), ARRAY[v_user_id]);
    END IF;

    FOR v_branch_row IN
        SELECT branch_id, role FROM user_branch_roles WHERE user_id = v_user_id
    LOOP
        IF v_branch_row.role = 'development_manager' THEN
            v_root := v_user_id;
        ELSIF v_branch_row.role IN ('supervisor', 'general_supervisor') THEN
            v_root := find_ancestor_by_role_branch_aware(v_user_id, v_branch_row.branch_id, 'development_manager');
        ELSIF v_branch_row.role = 'group_leader' THEN
            v_root := find_ancestor_by_role_branch_aware(v_user_id, v_branch_row.branch_id, 'general_supervisor');
        ELSIF v_branch_row.role IN ('agent', 'premium_agent') THEN
            v_root := find_ancestor_by_role_branch_aware(v_user_id, v_branch_row.branch_id, 'supervisor');
        ELSE
            v_root := v_user_id;
        END IF;

        v_result := v_result || get_user_subtree_branch_aware(v_root, v_branch_row.branch_id);
    END LOOP;

    IF array_length(v_result, 1) IS NULL THEN
        RETURN ARRAY[v_user_id];
    END IF;

    RETURN ARRAY(SELECT DISTINCT unnest(v_result));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path = public;

GRANT EXECUTE ON FUNCTION get_assistant_scope_ids() TO authenticated;
