-- نظام اعتماد "تقارير العمل اليومية" — إضافة فوق النظام الحالي فقط، بدون
-- أي تعديل على منطق التجميع الهرمي أو آلية إنشاء/تعديل التقارير الحالية.
--
-- حالة التقرير: pending (بانتظار الاعتماد) — الافتراضية عند أي حفظ | approved
-- (معتمد) | rejected (مرفوض). الاعتماد/الرفض مقصور على "المدير المباشر"
-- لصاحب التقرير فقط (owner.manager_id = المستخدم الحالي) — نفس هذا الشرط
-- الواحد يغطي كل الحالات المطلوبة تلقائياً (إيجنت تحت رئيس مجموعة، رئيس
-- مجموعة تحت مراقب، مراقب تحت مراقب عام، مراقب عام تحت مدير تطوير)، لأن
-- كل واحد من هؤلاء هو المدير المباشر الفعلي لمن تحته مباشرة فى جدول users.
-- الإيجنت لا يدير أحداً، فهذا الشرط يستبعده تلقائياً بدون أي كود إضافي.

ALTER TABLE daily_reports
    ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected')),
    ADD COLUMN IF NOT EXISTS reviewed_by uuid REFERENCES users(id),
    -- لقطة من اسم المعتمِد/الرافض وقت الإجراء (نفس نمط user_name/manager_name
    -- الموجود أصلاً فى الجدول) — تفادياً لأي join إضافي وقت العرض
    ADD COLUMN IF NOT EXISTS reviewed_by_name text,
    ADD COLUMN IF NOT EXISTS reviewed_at timestamptz,
    ADD COLUMN IF NOT EXISTS rejection_reason text;

CREATE INDEX IF NOT EXISTS idx_daily_reports_status ON daily_reports(status);

-- عند تعديل صاحب التقرير لمحتوى تقريره (مكالمات/مواعيد/مهام/تقييم) بعد ما
-- كان معتمَداً أو مرفوضاً، ترجع الحالة تلقائياً "بانتظار الاعتماد" وتُمسح
-- بيانات الاعتماد/الرفض السابقة — يشتغل فقط لو التعديل من نوع "محتوى" (مش
-- تحديث حالة الاعتماد نفسه، اللي بيحصل فقط عبر دوال approve/reject تحت،
-- واللي بتغيّر NEW.status صراحةً فتُستثنى تلقائياً من هذا الشرط).
CREATE OR REPLACE FUNCTION reset_daily_report_status_on_edit()
RETURNS trigger AS $$
BEGIN
    IF NEW.status IS NOT DISTINCT FROM OLD.status AND OLD.status <> 'pending' THEN
        IF NEW.calls_actual      IS DISTINCT FROM OLD.calls_actual
        OR NEW.calls_appointment IS DISTINCT FROM OLD.calls_appointment
        OR NEW.calls_rejected    IS DISTINCT FROM OLD.calls_rejected
        OR NEW.calls_no_answer   IS DISTINCT FROM OLD.calls_no_answer
        OR NEW.calls_postponed   IS DISTINCT FROM OLD.calls_postponed
        OR NEW.appointments      IS DISTINCT FROM OLD.appointments
        OR NEW.tasks             IS DISTINCT FROM OLD.tasks
        OR NEW.obstacles         IS DISTINCT FROM OLD.obstacles
        OR NEW.tomorrow_plan     IS DISTINCT FROM OLD.tomorrow_plan
        THEN
            NEW.status := 'pending';
            NEW.reviewed_by := NULL;
            NEW.reviewed_by_name := NULL;
            NEW.reviewed_at := NULL;
            NEW.rejection_reason := NULL;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_daily_reports_reset_status_on_edit ON daily_reports;
CREATE TRIGGER trg_daily_reports_reset_status_on_edit
    BEFORE UPDATE ON daily_reports
    FOR EACH ROW EXECUTE FUNCTION reset_daily_report_status_on_edit();

-- اعتماد تقرير — مسموح فقط للمدير المباشر لصاحب التقرير. SECURITY DEFINER
-- ضروري هنا لأن سياسة daily_reports_update_owner الحالية تسمح فقط لصاحب
-- التقرير بالـ UPDATE؛ الدالة نفسها تتحقق من صلاحية "المدير المباشر" قبل
-- أي تعديل، فلا تفتح أي ثغرة رغم تجاوزها لسياسة RLS.
CREATE OR REPLACE FUNCTION approve_daily_report(p_report_id uuid)
RETURNS daily_reports AS $$
DECLARE
    v_owner_manager uuid;
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

    -- ملحوظة: الفحص هنا لازم يكون IS NULL OR <> صريحاً — لو صاحب التقرير
    -- بلا مدير مباشر (manager_id فارغ)، فإن v_owner_manager <> auth.uid()
    -- لوحدها كانت هترجّع NULL (وليس TRUE)، وهو ما يعنى تجاوز الفحص بالخطأ
    -- والسماح لأي مستخدم بالاعتماد. الشرط الصريح ده يمنع هذه الثغرة.
    IF v_owner_manager IS NULL OR v_owner_manager <> auth.uid() THEN
        RAISE EXCEPTION 'غير مصرح لك باعتماد هذا التقرير — الاعتماد مقصور على المدير المباشر فقط';
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

-- رفض تقرير — نفس شرط "المدير المباشر"، ولا يُسمح بالرفض بدون سبب.
CREATE OR REPLACE FUNCTION reject_daily_report(p_report_id uuid, p_reason text)
RETURNS daily_reports AS $$
DECLARE
    v_owner_manager uuid;
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
