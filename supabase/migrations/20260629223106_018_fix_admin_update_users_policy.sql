-- إصلاح policy إدارة المستخدمين لضمان عمل UPDATE بشكل صح
-- الـ ALL policy بدون with_check ممكن تمنع UPDATE

-- نحذف الـ policy القديمة ونستبدلها بـ policies منفصلة أوضح
DROP POLICY IF EXISTS "users_admin_manage_all" ON users;

-- SELECT: الأدمن يشوف كل المستخدمين
CREATE POLICY "users_admin_select_all" ON users
  FOR SELECT TO authenticated
  USING (
    check_is_admin()
    OR id IN (SELECT unnest(get_user_subtree(auth.uid())))
  );

-- INSERT: الأدمن فقط
CREATE POLICY "users_admin_insert" ON users
  FOR INSERT TO authenticated
  WITH CHECK (check_is_admin());

-- UPDATE: الأدمن يعدل أي مستخدم، أو المستخدم يعدل بياناته هو
CREATE POLICY "users_admin_update" ON users
  FOR UPDATE TO authenticated
  USING (check_is_admin() OR id = auth.uid())
  WITH CHECK (check_is_admin() OR id = auth.uid());

-- DELETE: الأدمن فقط
CREATE POLICY "users_admin_delete" ON users
  FOR DELETE TO authenticated
  USING (check_is_admin());

-- نحذف الـ policy القديمة للـ update_own_profile لأنها بقت جزء من users_admin_update
DROP POLICY IF EXISTS "users_update_own_profile" ON users;

-- نحذف الـ select القديمة كمان عشان الجديدة بتغطيها
DROP POLICY IF EXISTS "users_select_own_and_below" ON users;
;
