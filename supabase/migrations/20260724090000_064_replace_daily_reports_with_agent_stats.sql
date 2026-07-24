-- ==========================================================================
-- إعادة بناء "تقارير العمل اليومية" بالكامل بآلية جديدة:
--
-- الإيجنت بقى يسلّم تقريره اليومي ورقياً لرئيس مجموعته خارج التطبيق تماماً
-- (لا يوجد أي إدخال رقمي من الإيجنت نفسه بعد الآن). رئيس المجموعة هو اللي
-- بيدخل "إجمالي الإحصائيات" فقط لكل فرد فى فريقه بعد مراجعة الورقة، فى شكل
-- أرقام مجمّعة (مش تفاصيل كل مكالمة/موعد كما كان سابقاً).
--
-- بالتالي يُلغى نظام daily_reports التفصيلي القديم بالكامل (الجدول + كل
-- دوال الاعتماد/الرفض المرتبطة به) ويُستبدل بجدول daily_agent_stats أبسط:
-- صف واحد لكل (إيجنت + تاريخ) بيسجّله رئيس مجموعته، بدون أي "حالة اعتماد"
-- منفصلة أصلاً — لأن دخول رئيس المجموعة للرقم هو نفسه المراجعة/الاعتماد.
-- ==========================================================================

-- (1) حذف كل الدوال/الـ triggers الخاصة بنظام الاعتماد القديم على daily_reports
DROP FUNCTION IF EXISTS approve_daily_report(uuid);
DROP FUNCTION IF EXISTS reject_daily_report(uuid, text);
DROP FUNCTION IF EXISTS cancel_daily_report_approval(uuid);
DROP FUNCTION IF EXISTS reset_daily_report_status_on_edit();
DROP FUNCTION IF EXISTS set_daily_reports_updated_at();

-- (2) حذف الجدول القديم نهائياً بكل بياناته التاريخية (قرار صريح: عدم
-- الاحتفاظ بأي أرشيف من التقارير التفصيلية القديمة)
DROP TABLE IF EXISTS daily_reports CASCADE;

-- (3) الجدول الجديد: إحصائيات يومية مجمّعة لكل إيجنت، يدخلها رئيس مجموعته فقط
CREATE TABLE daily_agent_stats (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- الفرد صاحب الإحصائية (الإيجنت)
    agent_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- رئيس المجموعة اللي أدخل الإحصائية
    entered_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    report_date date NOT NULL DEFAULT CURRENT_DATE,

    -- الالتزام بالمواعيد والزي الرسمي: نعم / لا
    punctuality_ok boolean NOT NULL,

    -- قسم المكالمات
    calls_actual int NOT NULL DEFAULT 0,
    calls_to_appointments int NOT NULL DEFAULT 0,

    -- قسم المواعيد
    appointments_actual int NOT NULL DEFAULT 0,
    -- جودة المواعيد بعد المراجعة: نص فقط، ومطلوبة فقط لو فيه مواعيد فعلية
    appointments_quality text
        CHECK (appointments_quality IN ('excellent', 'average', 'weak')),

    -- عملاء جدد (طلبات تأمين)
    new_clients int NOT NULL DEFAULT 0,

    -- مربع "عمل ميداني" (outdoor) — يُحدَّد لو مفيش مواعيد اليوم وتم العمل
    -- بنظام outdoor بدلاً من ذلك
    is_outdoor boolean NOT NULL DEFAULT false,

    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),

    -- تناسق منطقي: لا يصح ذكر جودة مواعيد بدون مواعيد فعلية أصلاً
    CONSTRAINT daily_agent_stats_quality_requires_appointments CHECK (
        appointments_quality IS NULL OR appointments_actual > 0
    ),
    -- عدد المكالمات التي أسفرت عن تحديد مواعيد لا يمكن أن يتجاوز إجمالي المكالمات
    CONSTRAINT daily_agent_stats_calls_balance CHECK (
        calls_to_appointments <= calls_actual
    ),

    -- صف واحد فقط لكل إيجنت لكل يوم
    CONSTRAINT daily_agent_stats_unique_agent_day UNIQUE (agent_id, report_date)
);

CREATE INDEX idx_daily_agent_stats_agent_id ON daily_agent_stats(agent_id);
CREATE INDEX idx_daily_agent_stats_entered_by ON daily_agent_stats(entered_by);
CREATE INDEX idx_daily_agent_stats_report_date ON daily_agent_stats(report_date);

ALTER TABLE daily_agent_stats ENABLE ROW LEVEL SECURITY;

-- عرض: الإيجنت نفسه + كل من هو أعلى منه فى الهيكل الإداري (نفس نمط
-- get_user_subtree المستخدم فى باقي النظام) — بحيث كل مدير يشوف إحصائيات
-- كل نطاقه، وينزل لأي فرد بعينه لو حب
DROP POLICY IF EXISTS "daily_agent_stats_select_hierarchy" ON daily_agent_stats;
CREATE POLICY "daily_agent_stats_select_hierarchy" ON daily_agent_stats FOR SELECT
    TO authenticated
    USING (agent_id IN (SELECT unnest(get_user_subtree(auth.uid()))));

-- إنشاء: رئيس مجموعة فقط، ولإيجنت داخل نطاقه الإداري فقط (get_user_subtree
-- تتضمن رئيس المجموعة نفسه دايماً كأول عنصر، فبتغطي فريقه المباشر تلقائياً)
DROP POLICY IF EXISTS "daily_agent_stats_insert_group_leader" ON daily_agent_stats;
CREATE POLICY "daily_agent_stats_insert_group_leader" ON daily_agent_stats FOR INSERT
    TO authenticated
    WITH CHECK (
        entered_by = auth.uid()
        AND agent_id IN (SELECT unnest(get_user_subtree(auth.uid())))
        AND agent_id <> auth.uid()
        AND EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'group_leader')
        AND EXISTS (SELECT 1 FROM users a WHERE a.id = agent_id AND a.role = 'agent')
    );

-- تعديل: نفس من أدخل الصف أصلاً فقط
DROP POLICY IF EXISTS "daily_agent_stats_update_entered_by" ON daily_agent_stats;
CREATE POLICY "daily_agent_stats_update_entered_by" ON daily_agent_stats FOR UPDATE
    TO authenticated
    USING (entered_by = auth.uid())
    WITH CHECK (
        entered_by = auth.uid()
        AND agent_id IN (SELECT unnest(get_user_subtree(auth.uid())))
        AND agent_id <> auth.uid()
    );

-- حذف: نفس من أدخل الصف أصلاً فقط
DROP POLICY IF EXISTS "daily_agent_stats_delete_entered_by" ON daily_agent_stats;
CREATE POLICY "daily_agent_stats_delete_entered_by" ON daily_agent_stats FOR DELETE
    TO authenticated
    USING (entered_by = auth.uid());

CREATE OR REPLACE FUNCTION set_daily_agent_stats_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_daily_agent_stats_updated_at ON daily_agent_stats;
CREATE TRIGGER trg_daily_agent_stats_updated_at
    BEFORE UPDATE ON daily_agent_stats
    FOR EACH ROW EXECUTE FUNCTION set_daily_agent_stats_updated_at();
