-- ==========================================================================
-- "التقييم الشامل": دمج نسبة تحقيق الهدف المالي مع درجة مؤشرات النشاط
-- اليومي (من daily_agent_stats) فى تقييم نهائي واحد لكل وكيل/رئيس مجموعة/
-- مراقب فى صفحة الإحصائيات الشاملة (Reports).
--
-- هذا الجدول يخزّن الأهداف اليومية الثابتة (تُقارَن بها الأرقام الفعلية)
-- لكل مؤشر نشاط قابل للقياس بهدف رقمي: المكالمات، المواعيد، العملاء الجدد.
-- "الالتزام بالمواعيد والزي الرسمي" لا يحتاج هدفاً رقمياً (نسبة التزام
-- طبيعية: عدد الأيام الملتزم فيها ÷ إجمالي أيام التقارير). "جودة المواعيد"
-- معروضة للعلم فقط ولا تدخل فى الدرجة الرقمية (حسب قرار صريح).
--
-- صف واحد فقط (singleton)، بنفس نمط جدول settings الموجود، لكن بصلاحية
-- تعديل مختلفة (super_admin + development_manager فقط) عن باقي settings
-- (المقصورة على super_admin وحده) — لذلك جدول منفصل بدل توسيع settings.
-- ==========================================================================

CREATE TABLE IF NOT EXISTS performance_activity_targets (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- هدف يومي: عدد المكالمات
    calls_daily_target int NOT NULL DEFAULT 15,
    -- هدف يومي: عدد المواعيد
    appointments_daily_target int NOT NULL DEFAULT 3,
    -- هدف يومي: عدد العملاء الجدد (طلبات تأمين)
    new_clients_daily_target int NOT NULL DEFAULT 1,

    updated_by uuid REFERENCES users(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),

    CONSTRAINT performance_activity_targets_positive CHECK (
        calls_daily_target > 0 AND appointments_daily_target > 0 AND new_clients_daily_target > 0
    )
);

ALTER TABLE performance_activity_targets ENABLE ROW LEVEL SECURITY;

-- عرض: أي مستخدم مسجّل دخوله (الأرقام نفسها مش حساسة، ولازمة لعرض تفاصيل
-- حساب الدرجة لأي مستوى إشرافي يشوف صفحة الإحصائيات الشاملة)
DROP POLICY IF EXISTS "performance_activity_targets_select_all" ON performance_activity_targets;
CREATE POLICY "performance_activity_targets_select_all" ON performance_activity_targets FOR SELECT
    TO authenticated
    USING (true);

DROP POLICY IF EXISTS "performance_activity_targets_update_admins" ON performance_activity_targets;
CREATE POLICY "performance_activity_targets_update_admins" ON performance_activity_targets FOR UPDATE
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin', 'development_manager')
        )
    )
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin', 'development_manager')
        )
    );

DROP POLICY IF EXISTS "performance_activity_targets_insert_admins" ON performance_activity_targets;
CREATE POLICY "performance_activity_targets_insert_admins" ON performance_activity_targets FOR INSERT
    TO authenticated
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM users WHERE id = auth.uid() AND role IN ('super_admin', 'development_manager')
        )
    );

INSERT INTO performance_activity_targets (id) VALUES (gen_random_uuid()) ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION set_performance_activity_targets_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_performance_activity_targets_updated_at ON performance_activity_targets;
CREATE TRIGGER trg_performance_activity_targets_updated_at
    BEFORE UPDATE ON performance_activity_targets
    FOR EACH ROW EXECUTE FUNCTION set_performance_activity_targets_updated_at();
