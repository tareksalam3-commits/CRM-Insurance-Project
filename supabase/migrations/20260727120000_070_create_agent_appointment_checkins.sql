-- ==========================================================================
-- ميزة جديدة ومستقلة عن نظام daily_agent_stats المجمّع: "مواعيد الفريق
-- وتثبيت الموقع".
--
-- رئيس المجموعة يدخّل مواعيد كل إيجنت (اسم عميل + وقت) صباحًا ضمن نفس
-- إدخاله اليومي المعتاد (بعد استلام التقرير الورقي)، والإيجنت وقت وصوله
-- فعليًا لكل معاد يدوس زرار "تسجيل الموقع الآن" من موبايله فيتثبّت موقعه
-- الجغرافي (من متصفحه مباشرة، بدون أي تكلفة API) على نفس المعاد ده تحديدًا.
--
-- الوسيط الحر (premium_agent) مستثنى: مالوش رئيس مجموعة يدخل له، فهو نفسه
-- بيدخل مواعيده ويثبت موقعه عليها.
-- ==========================================================================

CREATE TABLE agent_appointment_checkins (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

    -- صاحب المعاد (الإيجنت/الوسيط الحر اللي هيروح المعاد ده)
    agent_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    -- مين دخل المعاد: رئيس المجموعة عادةً، أو الوسيط الحر نفسه
    entered_by uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,

    client_name text NOT NULL CHECK (btrim(client_name) <> ''),
    appointment_time timestamptz NOT NULL,

    -- الموقع الجغرافي: بيتسجل مرة واحدة وقت وصول الإيجنت فعليًا ودوسه على
    -- الزرار (عبر دالة check_in_own_appointment أدناه)، مش وقت إدخال المعاد
    latitude double precision,
    longitude double precision,
    checked_in_at timestamptz,

    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),

    CONSTRAINT agent_appointment_checkins_location_pair CHECK (
        (latitude IS NULL) = (longitude IS NULL)
    ),
    CONSTRAINT agent_appointment_checkins_checkin_requires_location CHECK (
        (checked_in_at IS NULL) = (latitude IS NULL)
    ),
    CONSTRAINT agent_appointment_checkins_lat_range CHECK (
        latitude IS NULL OR latitude BETWEEN -90 AND 90
    ),
    CONSTRAINT agent_appointment_checkins_lng_range CHECK (
        longitude IS NULL OR longitude BETWEEN -180 AND 180
    )
);

CREATE INDEX idx_agent_appointment_checkins_agent_id ON agent_appointment_checkins(agent_id);
CREATE INDEX idx_agent_appointment_checkins_entered_by ON agent_appointment_checkins(entered_by);
CREATE INDEX idx_agent_appointment_checkins_appointment_time ON agent_appointment_checkins(appointment_time);

ALTER TABLE agent_appointment_checkins ENABLE ROW LEVEL SECURITY;

-- عرض: الإيجنت نفسه (مواعيده) + كل من هو أعلى منه فى الهيكل الإداري
DROP POLICY IF EXISTS "agent_appointment_checkins_select_hierarchy" ON agent_appointment_checkins;
CREATE POLICY "agent_appointment_checkins_select_hierarchy" ON agent_appointment_checkins FOR SELECT
    TO authenticated
    USING (agent_id IN (SELECT unnest(get_user_subtree(auth.uid()))));

-- إنشاء: إما رئيس مجموعة بيدخل معاد لإيجنت داخل فريقه المباشر، أو وسيط حر
-- بيدخل معاده لنفسه (بنفس منطق قيود daily_agent_stats تمامًا)
DROP POLICY IF EXISTS "agent_appointment_checkins_insert" ON agent_appointment_checkins;
CREATE POLICY "agent_appointment_checkins_insert" ON agent_appointment_checkins FOR INSERT
    TO authenticated
    WITH CHECK (
        entered_by = auth.uid()
        AND (
            (
                agent_id IN (SELECT unnest(get_user_subtree(auth.uid())))
                AND agent_id <> auth.uid()
                AND EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'group_leader')
                AND EXISTS (SELECT 1 FROM users a WHERE a.id = agent_id AND a.role = 'agent')
            )
            OR (
                agent_id = auth.uid()
                AND EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'premium_agent')
            )
        )
    );

-- تعديل بيانات المعاد (الاسم/الوقت): نفس من أدخله فقط — ده بيستثني الإيجنت
-- العادي من تعديل معاد دخّله رئيس مجموعته، وتسجيل الموقع نفسه بيتم من خلال
-- الدالة check_in_own_appointment أدناه مش من هنا
DROP POLICY IF EXISTS "agent_appointment_checkins_update_entered_by" ON agent_appointment_checkins;
CREATE POLICY "agent_appointment_checkins_update_entered_by" ON agent_appointment_checkins FOR UPDATE
    TO authenticated
    USING (entered_by = auth.uid())
    WITH CHECK (entered_by = auth.uid());

-- حذف: نفس من أدخل المعاد فقط
DROP POLICY IF EXISTS "agent_appointment_checkins_delete_entered_by" ON agent_appointment_checkins;
CREATE POLICY "agent_appointment_checkins_delete_entered_by" ON agent_appointment_checkins FOR DELETE
    TO authenticated
    USING (entered_by = auth.uid());

CREATE OR REPLACE FUNCTION set_agent_appointment_checkins_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agent_appointment_checkins_updated_at ON agent_appointment_checkins;
CREATE TRIGGER trg_agent_appointment_checkins_updated_at
    BEFORE UPDATE ON agent_appointment_checkins
    FOR EACH ROW EXECUTE FUNCTION set_agent_appointment_checkins_updated_at();

-- تثبيت الموقع: تُستدعى من الإيجنت نفسه فقط وقت وصوله الفعلي للمعاد.
-- SECURITY DEFINER عشان تقدر تحدّث lat/lng/checked_in_at فقط (من غير ما
-- تدّي الإيجنت صلاحية تعديل باقي بيانات المعاد اللي دخّلها رئيس مجموعته)،
-- مع التحقق الصريح جوّاها إن صاحب المعاد هو نفسه اللي بينادي الدالة
CREATE OR REPLACE FUNCTION check_in_own_appointment(
    p_appointment_id uuid,
    p_latitude double precision,
    p_longitude double precision
)
RETURNS agent_appointment_checkins AS $$
DECLARE
    result agent_appointment_checkins;
BEGIN
    IF p_latitude IS NULL OR p_longitude IS NULL THEN
        RAISE EXCEPTION 'location_required';
    END IF;

    UPDATE agent_appointment_checkins
    SET latitude = p_latitude,
        longitude = p_longitude,
        checked_in_at = now()
    WHERE id = p_appointment_id
      AND agent_id = auth.uid()
    RETURNING * INTO result;

    IF result.id IS NULL THEN
        RAISE EXCEPTION 'appointment_not_found_or_not_owned';
    END IF;

    RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

GRANT EXECUTE ON FUNCTION check_in_own_appointment(uuid, double precision, double precision) TO authenticated;
