-- حل جزء من المشكلة 2: تعدد الفروع مقتصر على رئيس مجموعة (group_leader) فما
-- فوق (get_role_level <= 5). الوكيل/وكيل بريميوم (get_role_level = 6) لازم
-- يكون له صف واحد بالظبط فى user_branch_roles.
CREATE OR REPLACE FUNCTION enforce_single_branch_for_agents()
RETURNS TRIGGER AS $$
DECLARE
    v_other_branches_count int;
BEGIN
    IF get_role_level(NEW.role) >= get_role_level('agent'::user_role) THEN
        SELECT count(*) INTO v_other_branches_count
        FROM user_branch_roles
        WHERE user_id = NEW.user_id
          AND id <> COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid)
          AND branch_id <> NEW.branch_id;

        IF v_other_branches_count > 0 THEN
            RAISE EXCEPTION
                'الوكيل (agent/premium_agent) لا يجوز أن يكون له أكثر من فرع واحد. ميزة تعدد الفروع متاحة فقط من رئيس مجموعة (group_leader) فما فوق.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_single_branch_for_agents ON user_branch_roles;
CREATE TRIGGER trg_enforce_single_branch_for_agents
    BEFORE INSERT OR UPDATE OF role, branch_id ON user_branch_roles
    FOR EACH ROW
    EXECUTE FUNCTION enforce_single_branch_for_agents();
