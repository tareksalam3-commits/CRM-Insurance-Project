-- تعديل قاعدة اعتماد "تقارير العمل اليومية": سلسلة الاعتماد تقف عند
-- المراقب (Supervisor) — رئيس المجموعة يعتمد تقارير إيجنته، والمراقب يعتمد
-- التقارير الكاملة لرؤساء المجموعات تحته، وهو آخر من يعتمد. المراقب العام
-- ومدير التطوير (وأي درجة أعلى) لا يملكون صلاحية الاعتماد/الرفض إطلاقاً،
-- حتى لو كانوا "المدير المباشر" لأحد فى الهيكل التنظيمي — الشرط السابق
-- (owner.manager_id = auth.uid()) وحده لم يعد كافياً، فنضيف فوقه شرط أن
-- يكون دور المعتمِد نفسه group_leader أو supervisor فقط.

CREATE OR REPLACE FUNCTION approve_daily_report(p_report_id uuid)
RETURNS daily_reports AS $$
DECLARE
    v_owner_manager uuid;
    v_approver_role text;
    v_approver_name text;
    v_result daily_reports;
BEGIN
    SELECT u.manager_id INTO v_owner_manager
    FROM daily_reports dr
    JOIN users u ON u.id = dr.owner_id
    WHERE dr.id = p_report_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'التقرير غير موجود';
    END IF;

    IF v_owner_manager IS NULL OR v_owner_manager <> auth.uid() THEN
        RAISE EXCEPTION 'غير مصرح لك باعتماد هذا التقرير — الاعتماد مقصور على المدير المباشر فقط';
    END IF;

    SELECT role, name INTO v_approver_role, v_approver_name FROM users WHERE id = auth.uid();

    -- سلسلة الاعتماد تقف عند المراقب — أي درجة أعلى (مراقب عام، مدير
    -- تطوير...) لا تملك صلاحية الاعتماد حتى لو كانت مديراً مباشراً لأحد
    IF v_approver_role NOT IN ('group_leader', 'supervisor') THEN
        RAISE EXCEPTION 'غير مصرح لك باعتماد تقارير العمل اليومي — الاعتماد مقصور على رئيس المجموعة والمراقب فقط';
    END IF;

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

CREATE OR REPLACE FUNCTION reject_daily_report(p_report_id uuid, p_reason text)
RETURNS daily_reports AS $$
DECLARE
    v_owner_manager uuid;
    v_approver_role text;
    v_approver_name text;
    v_result daily_reports;
BEGIN
    IF p_reason IS NULL OR btrim(p_reason) = '' THEN
        RAISE EXCEPTION 'سبب الرفض مطلوب';
    END IF;

    SELECT u.manager_id INTO v_owner_manager
    FROM daily_reports dr
    JOIN users u ON u.id = dr.owner_id
    WHERE dr.id = p_report_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'التقرير غير موجود';
    END IF;

    IF v_owner_manager IS NULL OR v_owner_manager <> auth.uid() THEN
        RAISE EXCEPTION 'غير مصرح لك برفض هذا التقرير — الرفض مقصور على المدير المباشر فقط';
    END IF;

    SELECT role, name INTO v_approver_role, v_approver_name FROM users WHERE id = auth.uid();

    IF v_approver_role NOT IN ('group_leader', 'supervisor') THEN
        RAISE EXCEPTION 'غير مصرح لك برفض تقارير العمل اليومي — الرفض مقصور على رئيس المجموعة والمراقب فقط';
    END IF;

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
