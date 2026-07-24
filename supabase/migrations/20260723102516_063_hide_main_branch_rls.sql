-- استكمال إخفاء "الفرع الرئيسي" — من مستوى الواجهة (UI-level فى
-- branchVisibility.ts) لمستوى RLS نفسه. قبل هذه الـ migration كانت
-- السياسة على branches و user_branch_roles USING (true) لأي مستخدم
-- مسجّل دخول (راجع 052) — يعني أي استعلام مباشر على الـ API (مش لازم
-- يمر بالواجهة) كان يقدر يشوف الفرع الرئيسي وصفوفه.
--
-- "الفرع الرئيسي" هنا معرّف بعمود branches.is_headquarters الصريح (migration
-- 058_add_headquarters_branch)، مطابقة تمامًا لمعيار دالة sync_primary_branch_role
-- الفعلية (061_default_branch_from_manager) ولـ branchVisibility.ts فى الفرونت إند.
--
-- is_main_branch كدالة SECURITY DEFINER عمداً: لازم تقرأ من جدول branches
-- من غير ما تدخل فى نفس الـ RLS policy اللي هي جزء من تعريفها (تفادي أي
-- تكرار/recursion غير ضروري وقت تقييم الـ policy).

CREATE OR REPLACE FUNCTION is_main_branch(p_branch_id uuid)
RETURNS boolean AS $$
  SELECT EXISTS (
    SELECT 1 FROM branches WHERE id = p_branch_id AND is_headquarters = true
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public;

REVOKE EXECUTE ON FUNCTION is_main_branch(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION is_main_branch(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION is_main_branch(uuid) TO authenticated;

-- ===== جدول branches: يمنع قراءة صف الفرع الرئيسي نفسه لغير super_admin =====
DROP POLICY IF EXISTS "branches_select_authenticated" ON branches;
CREATE POLICY "branches_select_authenticated" ON branches FOR SELECT
    TO authenticated
    USING (
        NOT is_main_branch(id)
        OR EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role = 'super_admin'
        )
    );

-- ===== جدول user_branch_roles: يمنع قراءة أي صف مربوط بالفرع الرئيسي
-- لغير super_admin (فى الحالة الطبيعية دي صفوف الـ super_admin بس، لأن أي
-- مستخدم تانى بيتحدد فرعه الافتراضي من فرع مديره وليس الفرع الرئيسي —
-- راجع 061_default_branch_from_manager) =====
DROP POLICY IF EXISTS "user_branch_roles_select_authenticated" ON user_branch_roles;
CREATE POLICY "user_branch_roles_select_authenticated" ON user_branch_roles FOR SELECT
    TO authenticated
    USING (
        NOT is_main_branch(branch_id)
        OR EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role = 'super_admin'
        )
    );
