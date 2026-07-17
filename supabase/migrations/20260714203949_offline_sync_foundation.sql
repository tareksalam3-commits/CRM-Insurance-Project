-- [ملف مُعاد بناؤه من الحالة الفعلية لقاعدة البيانات الحية بتاريخ 2026-07-16
--  عبر Supabase MCP — لم يكن موجودًا فى نسخة المستودع الأصلية]
--
-- جدول sync_operations: يسجل نتيجة كل عملية "Offline-first" (بمعرّف
-- operation_id فريد ينشئه التطبيق على جهاز المستخدم) — يخزن نتيجة
-- النجاح/الفشل/التعارض عشان لو اتكررت نفس العملية (retry) يرجع نفس
-- النتيجة القديمة بدل ما ينفذها تانى (Idempotency).

CREATE TABLE IF NOT EXISTS public.sync_operations (
    operation_id uuid PRIMARY KEY,
    operation_type text NOT NULL,
    entity_type text NOT NULL,
    entity_id uuid,
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE RESTRICT,
    status text NOT NULL DEFAULT 'success'
        CHECK (status = ANY (ARRAY['success'::text, 'failed'::text, 'conflict'::text])),
    payload jsonb,
    result jsonb,
    error_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    processed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sync_operations_user ON public.sync_operations(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sync_operations_entity ON public.sync_operations(entity_type, entity_id);

ALTER TABLE public.sync_operations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sync_operations_select_own" ON public.sync_operations;
CREATE POLICY "sync_operations_select_own" ON public.sync_operations FOR SELECT
    USING (
        user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin')
    );

DROP POLICY IF EXISTS "sync_operations_insert_own" ON public.sync_operations;
CREATE POLICY "sync_operations_insert_own" ON public.sync_operations FOR INSERT
    WITH CHECK (user_id = auth.uid());
