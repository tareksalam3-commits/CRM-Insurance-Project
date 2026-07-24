-- توسيع صلاحية اعتماد/رفض "تقارير العمل اليومية": بالإضافة لشرط "المدير
-- المباشر" الحالي، يُسمح الآن لرئيس المجموعة والمراقب (الدرجتان الوحيدتان
-- اللتان تملكان صلاحية الاعتماد أصلاً) باعتماد/رفض أي تقرير ضمن نطاقهما
-- الهرمي بأكمله دفعة واحدة — سواء تقريرهما الشخصي هما نفسهما (لا يوجد أحد
-- فوقهما يملك صلاحية الاعتماد أصلاً ليعتمده، فيظل عالقاً للأبد بدون هذا
-- الاستثناء)، أو تقارير من هم أعمق من مرؤوسيهم المباشرين (مثال: المراقب
-- يعتمد تقرير إيجنت تحت رئيس مجموعة تحته مباشرة، دفعة واحدة مع الكل).
--
-- هذا لا يُلغي شرط "المدير المباشر" الحالي، بل يضيف له حالة بديلة: مسموح
-- بالاعتماد لو تحقق أي من الشرطين:
--   1) auth.uid() هو المدير المباشر لصاحب التقرير (كما كان)
--   2) auth.uid() بدرجة "رئيس مجموعة" أو "مراقب"، وصاحب التقرير (بما فيه
--      auth.uid() نفسه) ضمن get_user_subtree(auth.uid())

CREATE OR REPLACE FUNCTION approve_daily_report(p_report_id uuid)
RETURNS daily_reports AS $$
DECLARE
    v_owner_id uuid;
    v_owner_manager uuid;
    v_approver_role user_role;
    v_approver_name text;
    v_authorized boolean := false;
    v_result daily_reports;
BEGIN
    SELECT dr.owner_id, u.manager_id INTO v_owner_id, v_owner_manager
    FROM daily_reports dr
    JOIN users u ON u.id = dr.owner_id
    WHERE dr.id = p_report_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'التقرير غير موجود';
    END IF;

    SELECT role INTO v_approver_role FROM users WHERE id = auth.uid();

    -- الشرط 1: المدير المباشر لصاحب التقرير (كما كان سابقاً)
    IF v_owner_manager IS NOT NULL AND v_owner_manager = auth.uid() THEN
        v_authorized := true;
    END IF;

    -- الشرط 2: رئيس مجموعة/مراقب يعتمد لنفسه أو لأي أحد ضمن نطاقه الهرمي
    -- الكامل (كل المستويات) — يشمل هذا حالة اعتماد الشخص لتقريره هو نفسه
    -- لأن get_user_subtree تتضمن صاحبها نفسه أصلاً
    IF NOT v_authorized AND v_approver_role IN ('supervisor', 'group_leader') THEN
        IF v_owner_id = ANY(get_user_subtree(auth.uid())) THEN
            v_authorized := true;
        END IF;
    END IF;

    IF NOT v_authorized THEN
        RAISE EXCEPTION 'غير مصرح لك باعتماد هذا التقرير';
    END IF;

    SELECT name INTO v_approver_name FROM users WHERE id = auth.uid();

    UPDATE daily_reports
    SET status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_by_name = v_approver_name,
        reviewed_at = now(),
        rejection_reason = NULL
    WHERE id = p_report_id
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION approve_daily_report(uuid) TO authenticated;

-- نفس التوسيع بالضبط لدالة الرفض، للاتساق (لا يزال سبب الرفض إلزامياً)
CREATE OR REPLACE FUNCTION reject_daily_report(p_report_id uuid, p_reason text)
RETURNS daily_reports AS $$
DECLARE
    v_owner_id uuid;
    v_owner_manager uuid;
    v_approver_role user_role;
    v_approver_name text;
    v_authorized boolean := false;
    v_result daily_reports;
BEGIN
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RAISE EXCEPTION 'سبب الرفض مطلوب';
    END IF;

    SELECT dr.owner_id, u.manager_id INTO v_owner_id, v_owner_manager
    FROM daily_reports dr
    JOIN users u ON u.id = dr.owner_id
    WHERE dr.id = p_report_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'التقرير غير موجود';
    END IF;

    SELECT role INTO v_approver_role FROM users WHERE id = auth.uid();

    IF v_owner_manager IS NOT NULL AND v_owner_manager = auth.uid() THEN
        v_authorized := true;
    END IF;

    IF NOT v_authorized AND v_approver_role IN ('supervisor', 'group_leader') THEN
        IF v_owner_id = ANY(get_user_subtree(auth.uid())) THEN
            v_authorized := true;
        END IF;
    END IF;

    IF NOT v_authorized THEN
        RAISE EXCEPTION 'غير مصرح لك برفض هذا التقرير';
    END IF;

    SELECT name INTO v_approver_name FROM users WHERE id = auth.uid();

    UPDATE daily_reports
    SET status = 'rejected',
        reviewed_by = auth.uid(),
        reviewed_by_name = v_approver_name,
        reviewed_at = now(),
        rejection_reason = btrim(p_reason)
    WHERE id = p_report_id
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION reject_daily_report(uuid, text) TO authenticated;
