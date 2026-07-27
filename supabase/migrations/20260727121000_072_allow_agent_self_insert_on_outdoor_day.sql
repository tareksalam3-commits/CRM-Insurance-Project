-- توسعة سياسة الإنشاء: يوم outdoor (مفيش مواعيد محددة سلفًا، رئيس المجموعة
-- علّم عليه ميدانى) — الإيجنت العادي (مش بس الوسيط الحر) يقدر يدخل الأماكن
-- اللى راحها بنفسه لنفس اليوم ده، لأن مفيش مواعيد جاهزة رئيس مجموعته
-- يقدر يدخّلها له مسبقًا
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
            OR (
                agent_id = auth.uid()
                AND EXISTS (SELECT 1 FROM users u WHERE u.id = auth.uid() AND u.role = 'agent')
                AND EXISTS (
                    SELECT 1 FROM daily_agent_stats d
                    WHERE d.agent_id = auth.uid()
                      AND d.report_date = appointment_time::date
                      AND d.is_outdoor = true
                )
            )
        )
    );
