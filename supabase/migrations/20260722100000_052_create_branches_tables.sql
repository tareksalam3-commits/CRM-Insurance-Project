-- المرحلة الأولى من دعم "تعدد الفروع": بناء الجداول فقط وتجهيز البيانات،
-- بدون أي استخدام فعلي لها من أي حاسبة أو تقرير أو RLS policy موجودة حاليًا.
-- Additive-only بالكامل: لا تعديل ولا حذف فى جدول users أو أي policy عليه،
-- ولا فى get_user_subtree، ولا فى أي حاسبة/تقرير شغال حاليًا.
--
-- الفكرة: `branches` (الفروع) و `user_branch_roles` (وضع كل مستخدم فى كل
-- فرع: دوره + مديره المباشر فى هذا الفرع بالذات + هل هو وضعه الأساسي أم لا).
-- مستخدم واحد ممكن يبقى ليه أكتر من صف فى user_branch_roles (فرع أساسي +
-- أوضاع إضافية فى فروع تانية) — لكن ولا جزء من التطبيق بيقرأ من الجدول ده
-- لسه، فمفيش أي تأثير على أي سلوك حالي.

-- ===== جدول الفروع =====
CREATE TABLE IF NOT EXISTS branches (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text UNIQUE NOT NULL,
    is_active boolean NOT NULL DEFAULT true,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_branches_is_active ON branches(is_active);

-- ===== جدول "وضع المستخدم فى الفرع" =====
-- role تستخدم نفس enum الأدوار الموجود بالفعل (user_role) بدون أي تعديل فيه.
CREATE TABLE IF NOT EXISTS user_branch_roles (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    branch_id uuid NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
    role user_role NOT NULL,
    manager_id uuid REFERENCES users(id) ON DELETE SET NULL,
    is_primary boolean NOT NULL DEFAULT false,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    UNIQUE (user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_user_branch_roles_user_id ON user_branch_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_roles_branch_id ON user_branch_roles(branch_id);
CREATE INDEX IF NOT EXISTS idx_user_branch_roles_manager_id ON user_branch_roles(manager_id);

-- ===== تحديث updated_at تلقائيًا (بإعادة استخدام الدالة العامة الموجودة
-- بالفعل من 001_create_users_table.sql — بدون أي تعديل فيها) =====
DROP TRIGGER IF EXISTS update_branches_updated_at ON branches;
CREATE TRIGGER update_branches_updated_at
    BEFORE UPDATE ON branches
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_user_branch_roles_updated_at ON user_branch_roles;
CREATE TRIGGER update_user_branch_roles_updated_at
    BEFORE UPDATE ON user_branch_roles
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ===== التأكد إن manager_id (لو موجود) يبقى ليه فعلاً صف فى نفس الفرع =====
-- Constraint Trigger مؤجّل (DEFERRABLE INITIALLY DEFERRED) عمداً بدل تريجر
-- عادي: عشان الـ backfill الجاي فى الـ migration التالي بيدخل صف لكل مستخدم
-- (بما فيهم المديرين) فى نفس عملية INSERT الواحدة، فمينفعش نتأكد من وجود
-- صف المدير لحظة إدخال صف المرؤوس (ترتيب الصفوف داخل نفس الأمر مش مضمون).
-- بتأجيل الفحص لحد الـ COMMIT، كل الصفوف بتبقى موجودة فعلاً وقت الفحص.
CREATE OR REPLACE FUNCTION validate_user_branch_role_manager()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.manager_id IS NOT NULL THEN
        IF NOT EXISTS (
            SELECT 1 FROM user_branch_roles
            WHERE user_id = NEW.manager_id AND branch_id = NEW.branch_id
        ) THEN
            RAISE EXCEPTION
                'manager_id (%) must have a role in the same branch (%) as user_id (%)',
                NEW.manager_id, NEW.branch_id, NEW.user_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_validate_user_branch_role_manager ON user_branch_roles;
CREATE CONSTRAINT TRIGGER trg_validate_user_branch_role_manager
    AFTER INSERT OR UPDATE ON user_branch_roles
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    EXECUTE FUNCTION validate_user_branch_role_manager();

-- ===== RLS =====
-- القراءة: أي مستخدم مسجّل دخول. التعديل (إضافة/تحديث/حذف): super_admin
-- و development_manager بس — بنفس منطق users_update_admin_only الموجود
-- بالفعل فى 001_create_users_table.sql، بدون أي تعديل على تلك الـ policy.
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_branch_roles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "branches_select_authenticated" ON branches;
CREATE POLICY "branches_select_authenticated" ON branches FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "branches_insert_admin_only" ON branches;
CREATE POLICY "branches_insert_admin_only" ON branches FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'development_manager')
        )
    );

DROP POLICY IF EXISTS "branches_update_admin_only" ON branches;
CREATE POLICY "branches_update_admin_only" ON branches FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'development_manager')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'development_manager')
        )
    );

DROP POLICY IF EXISTS "branches_delete_admin_only" ON branches;
CREATE POLICY "branches_delete_admin_only" ON branches FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'development_manager')
        )
    );

DROP POLICY IF EXISTS "user_branch_roles_select_authenticated" ON user_branch_roles;
CREATE POLICY "user_branch_roles_select_authenticated" ON user_branch_roles FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "user_branch_roles_insert_admin_only" ON user_branch_roles;
CREATE POLICY "user_branch_roles_insert_admin_only" ON user_branch_roles FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'development_manager')
        )
    );

DROP POLICY IF EXISTS "user_branch_roles_update_admin_only" ON user_branch_roles;
CREATE POLICY "user_branch_roles_update_admin_only" ON user_branch_roles FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'development_manager')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'development_manager')
        )
    );

DROP POLICY IF EXISTS "user_branch_roles_delete_admin_only" ON user_branch_roles;
CREATE POLICY "user_branch_roles_delete_admin_only" ON user_branch_roles FOR DELETE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users
            WHERE id = auth.uid()
            AND role IN ('super_admin', 'development_manager')
        )
    );
