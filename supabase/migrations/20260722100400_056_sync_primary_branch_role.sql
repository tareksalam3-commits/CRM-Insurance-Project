-- ملاحظة مزامنة: هذا الملف حل محل مسودة قديمة فى الريبو باسم قريب
-- (056_sync_users_primary_branch_role.sql) كانت بتعتمد على منطق مختلف
-- (branch_id صريح فى user_metadata + فرع المدير + استثناء صريح لـ
-- super_admin) لم يُطبَّق فعليًا بهذا الشكل. النسخة الحقيقية المطبّقة هي
-- ده تحت (الفرع الافتراضي لأي مستخدم جديد = "الفرع الرئيسي" بالاسم، بدون
-- أي شرط على المدير) — وتم استبدالها لاحقًا بمنطق أكثر تفصيلاً فى
-- migration 061_default_branch_from_manager.

CREATE OR REPLACE FUNCTION sync_primary_branch_role()
RETURNS TRIGGER AS $$
DECLARE
    v_default_branch_id uuid;
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF EXISTS (SELECT 1 FROM user_branch_roles WHERE user_id = NEW.id AND is_primary = true) THEN
            RETURN NEW;
        END IF;

        SELECT id INTO v_default_branch_id FROM branches WHERE name = 'الفرع الرئيسي' LIMIT 1;
        IF v_default_branch_id IS NULL THEN
            RETURN NEW;
        END IF;

        INSERT INTO user_branch_roles (user_id, branch_id, role, manager_id, is_primary)
        VALUES (NEW.id, v_default_branch_id, NEW.role, NEW.manager_id, true)
        ON CONFLICT (user_id, branch_id) DO NOTHING;

        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF NEW.role IS DISTINCT FROM OLD.role OR NEW.manager_id IS DISTINCT FROM OLD.manager_id THEN
            UPDATE user_branch_roles
            SET role = NEW.role, manager_id = NEW.manager_id, updated_at = now()
            WHERE user_id = NEW.id AND is_primary = true;
        END IF;
        RETURN NEW;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS trg_sync_primary_branch_role_insert ON users;
CREATE TRIGGER trg_sync_primary_branch_role_insert
    AFTER INSERT ON users
    FOR EACH ROW
    EXECUTE FUNCTION sync_primary_branch_role();

DROP TRIGGER IF EXISTS trg_sync_primary_branch_role_update ON users;
CREATE TRIGGER trg_sync_primary_branch_role_update
    AFTER UPDATE ON users
    FOR EACH ROW
    EXECUTE FUNCTION sync_primary_branch_role();

INSERT INTO user_branch_roles (user_id, branch_id, role, manager_id, is_primary)
SELECT u.id, b.id, u.role, u.manager_id, true
FROM users u
CROSS JOIN (SELECT id FROM branches WHERE name = 'الفرع الرئيسي' LIMIT 1) b
WHERE NOT EXISTS (
    SELECT 1 FROM user_branch_roles ubr WHERE ubr.user_id = u.id AND ubr.is_primary = true
)
ON CONFLICT (user_id, branch_id) DO NOTHING;
