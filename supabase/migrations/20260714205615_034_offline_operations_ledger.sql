-- ===================================
-- سجل عمليات Offline Queue — الغرض الوحيد منه: تسجيل أن عملية بعينها
-- (بمعرّف operation_id فريد يُنشئه التطبيق على جهاز المستخدم) تم تنفيذها
-- فعلاً على السيرفر، حتى لو أُعيد إرسالها أكثر من مرة (مثلاً لو التطبيق
-- اتقفل قبل ما يمسحها من الطابور المحلي بعد نجاحها). لا علاقة له بمنطق أي
-- عملية عمل (Business Logic) — هو فقط "دفتر تسجيل" عام يصلح لأي نوع عملية
-- نضيفه مستقبلاً لدعم Offline بدون أي تعديل في الجدول نفسه.
-- ===================================

CREATE TABLE IF NOT EXISTS offline_operations (
    operation_id   uuid PRIMARY KEY,
    operation_type text NOT NULL,
    entity_id      uuid,
    user_id        uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    created_at     timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_offline_operations_user_id ON offline_operations(user_id);
CREATE INDEX IF NOT EXISTS idx_offline_operations_created_at ON offline_operations(created_at DESC);

ALTER TABLE offline_operations ENABLE ROW LEVEL SECURITY;

-- كل مستخدم يشوف ويسجّل عملياته هو بس (نفس الجهاز/الجلسة اللي نفّذت العملية
-- أصلاً) — مفيش داعي لصلاحيات هرمية زي activity_logs لأن الغرض هنا فني بحت
DROP POLICY IF EXISTS "offline_operations_select_own" ON offline_operations;
CREATE POLICY "offline_operations_select_own" ON offline_operations FOR SELECT
    TO authenticated
    USING (user_id = auth.uid());

DROP POLICY IF EXISTS "offline_operations_insert_own" ON offline_operations;
CREATE POLICY "offline_operations_insert_own" ON offline_operations FOR INSERT
    TO authenticated
    WITH CHECK (user_id = auth.uid());
;
