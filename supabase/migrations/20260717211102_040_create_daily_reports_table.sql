-- صفحة "تقارير العمل اليومية" — جدول تخزين التقارير اليومية للمستخدمين
-- كل تقرير مرتبط بصاحبه (owner_id) وياخد لقطة (snapshot) من اسمه/وظيفته/
-- اسم مديره وقت الحفظ، عشان لو الهيكل الإداري اتغيّر بعد كده التقرير
-- القديم يفضل يعرض البيانات الصحيحة وقت إنشائه.

CREATE TABLE IF NOT EXISTS daily_reports (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    report_date date NOT NULL DEFAULT CURRENT_DATE,

    -- لقطة من بيانات المستخدم وقت إنشاء التقرير (القسم الأول - للعرض فقط)
    user_name text NOT NULL,
    user_role text NOT NULL,
    manager_name text,

    -- القسم الثاني - المكالمات
    calls_actual int NOT NULL DEFAULT 0,
    calls_appointment int NOT NULL DEFAULT 0,
    calls_rejected int NOT NULL DEFAULT 0,
    calls_no_answer int NOT NULL DEFAULT 0,
    calls_postponed int NOT NULL DEFAULT 0,

    -- القسم الثالث - المواعيد (مصفوفة JSON: اسم العميل / الهاتف / العنوان / نتيجة الزيارة)
    appointments jsonb NOT NULL DEFAULT '[]'::jsonb,

    -- القسم الرابع - تقييم اليوم (اختياري)
    obstacles text,
    tomorrow_plan text,

    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),

    CONSTRAINT daily_reports_calls_balance CHECK (
        calls_appointment + calls_rejected + calls_no_answer + calls_postponed = calls_actual
    )
);

CREATE INDEX IF NOT EXISTS idx_daily_reports_owner_id ON daily_reports(owner_id);
CREATE INDEX IF NOT EXISTS idx_daily_reports_report_date ON daily_reports(report_date);

ALTER TABLE daily_reports ENABLE ROW LEVEL SECURITY;

-- عرض: صاحب التقرير + كل من هو أعلى منه فى الهيكل الإداري (نفس نمط
-- customers_select_hierarchy / users_select_own_and_below المستخدم فى باقي النظام)
DROP POLICY IF EXISTS "daily_reports_select_hierarchy" ON daily_reports;
CREATE POLICY "daily_reports_select_hierarchy" ON daily_reports FOR SELECT
    TO authenticated
    USING (owner_id IN (SELECT unnest(get_user_subtree(auth.uid()))));

-- إنشاء: كل مستخدم يقدر يُنشئ تقريره الخاص فقط
DROP POLICY IF EXISTS "daily_reports_insert_owner" ON daily_reports;
CREATE POLICY "daily_reports_insert_owner" ON daily_reports FOR INSERT
    TO authenticated
    WITH CHECK (owner_id = auth.uid());

-- تعديل: صاحب التقرير فقط
DROP POLICY IF EXISTS "daily_reports_update_owner" ON daily_reports;
CREATE POLICY "daily_reports_update_owner" ON daily_reports FOR UPDATE
    TO authenticated
    USING (owner_id = auth.uid())
    WITH CHECK (owner_id = auth.uid());

-- حذف: صاحب التقرير فقط
DROP POLICY IF EXISTS "daily_reports_delete_owner" ON daily_reports;
CREATE POLICY "daily_reports_delete_owner" ON daily_reports FOR DELETE
    TO authenticated
    USING (owner_id = auth.uid());

CREATE OR REPLACE FUNCTION set_daily_reports_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_daily_reports_updated_at ON daily_reports;
CREATE TRIGGER trg_daily_reports_updated_at
    BEFORE UPDATE ON daily_reports
    FOR EACH ROW EXECUTE FUNCTION set_daily_reports_updated_at();
