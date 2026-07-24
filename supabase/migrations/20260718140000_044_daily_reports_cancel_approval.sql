-- إلغاء اعتماد تقرير سبق اعتماده: نفس شرط الصلاحية المستخدم فى approve/
-- reject بالضبط (المدير المباشر لصاحب التقرير، أو رئيس مجموعة/مراقب لأي
-- تقرير ضمن نطاقه الهرمي بالكامل — انظر daily_reports_cascade_approval).
-- يعمل فقط لو التقرير حالياً "معتمد" (approved)، ويرجّعه لحالة "بانتظار
-- الاعتماد" (pending) مع مسح بيانات المراجعة السابقة، حتى يقدر صاحب
-- الصلاحية يراجعه أو يرفضه من جديد لو اعتمده بالخطأ.

CREATE OR REPLACE FUNCTION cancel_daily_report_approval(p_report_id uuid)
RETURNS daily_reports AS $$
DECLARE
    v_owner_id uuid;
    v_owner_manager uuid;
    v_approver_role user_role;
    v_current_status text;
    v_authorized boolean := false;
    v_result daily_reports;
BEGIN
    SELECT dr.owner_id, u.manager_id, dr.status INTO v_owner_id, v_owner_manager, v_current_status
    FROM daily_reports dr
    JOIN users u ON u.id = dr.owner_id
    WHERE dr.id = p_report_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'التقرير غير موجود';
    END IF;

    IF v_current_status <> 'approved' THEN
        RAISE EXCEPTION 'لا يمكن إلغاء الاعتماد إلا لتقرير معتمَد بالفعل';
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
        RAISE EXCEPTION 'غير مصرح لك بإلغاء اعتماد هذا التقرير';
    END IF;

    UPDATE daily_reports
    SET status = 'pending',
        reviewed_by = NULL,
        reviewed_by_name = NULL,
        reviewed_at = NULL,
        rejection_reason = NULL
    WHERE id = p_report_id
    RETURNING * INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION cancel_daily_report_approval(uuid) TO authenticated;
