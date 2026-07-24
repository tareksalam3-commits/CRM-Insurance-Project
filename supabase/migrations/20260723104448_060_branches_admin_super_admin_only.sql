-- إدارة الفروع (إضافة/تعديل/حذف فرع، وربط مستخدم بوضع وظيفي إضافي فى فرع
-- تاني) بقت مقصورة على super_admin بس — development_manager اتشال من كل
-- policies التعديل على جدولي branches و user_branch_roles. القراءة (SELECT)
-- فضلت متاحة لأي مستخدم مسجّل دخول زي ما هي، عشان BranchSelector للمستخدمين
-- متعددي الفروع يفضل شغال طبيعي.

DROP POLICY IF EXISTS "branches_insert_admin_only" ON branches;
CREATE POLICY "branches_insert_admin_only" ON branches FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role = 'super_admin'
        )
    );

DROP POLICY IF EXISTS "branches_update_admin_only" ON branches;
CREATE POLICY "branches_update_admin_only" ON branches FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role = 'super_admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role = 'super_admin'
        )
    );

DROP POLICY IF EXISTS "branches_delete_admin_only" ON branches;
CREATE POLICY "branches_delete_admin_only" ON branches FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role = 'super_admin'
        )
    );

DROP POLICY IF EXISTS "user_branch_roles_insert_admin_only" ON user_branch_roles;
CREATE POLICY "user_branch_roles_insert_admin_only" ON user_branch_roles FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role = 'super_admin'
        )
    );

DROP POLICY IF EXISTS "user_branch_roles_update_admin_only" ON user_branch_roles;
CREATE POLICY "user_branch_roles_update_admin_only" ON user_branch_roles FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role = 'super_admin'
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role = 'super_admin'
        )
    );

DROP POLICY IF EXISTS "user_branch_roles_delete_admin_only" ON user_branch_roles;
CREATE POLICY "user_branch_roles_delete_admin_only" ON user_branch_roles FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role = 'super_admin'
        )
    );
