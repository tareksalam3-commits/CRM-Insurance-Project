-- [ملف مُعاد بناؤه من الحالة الفعلية لقاعدة البيانات الحية بتاريخ 2026-07-16
--  عبر Supabase MCP — لم يكن موجودًا فى نسخة المستودع الأصلية]
--
-- بنية تحتية للمساعد الذكي (AI Assistant): إعدادات مزودي الذكاء الاصطناعي
-- (ai_provider_configs) + محادثات ورسائل المستخدمين مع المساعد
-- (ai_conversations / ai_messages).

-- ===== ai_provider_configs =====
CREATE TABLE IF NOT EXISTS public.ai_provider_configs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL UNIQUE,
    display_name text NOT NULL,
    secret_name text NOT NULL,
    model text NOT NULL,
    is_active boolean NOT NULL DEFAULT false,
    priority integer NOT NULL DEFAULT 0,
    last_tested_at timestamptz,
    last_test_status text NOT NULL DEFAULT 'untested'
        CHECK (last_test_status = ANY (ARRAY['connected'::text, 'error'::text, 'untested'::text])),
    last_test_message text,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_configs_priority ON public.ai_provider_configs(priority);

ALTER TABLE public.ai_provider_configs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_provider_configs_select_super_admin" ON public.ai_provider_configs;
CREATE POLICY "ai_provider_configs_select_super_admin" ON public.ai_provider_configs FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin'));

DROP POLICY IF EXISTS "ai_provider_configs_insert_super_admin" ON public.ai_provider_configs;
CREATE POLICY "ai_provider_configs_insert_super_admin" ON public.ai_provider_configs FOR INSERT
    TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin'));

DROP POLICY IF EXISTS "ai_provider_configs_update_super_admin" ON public.ai_provider_configs;
CREATE POLICY "ai_provider_configs_update_super_admin" ON public.ai_provider_configs FOR UPDATE
    TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin'));

DROP POLICY IF EXISTS "ai_provider_configs_delete_super_admin" ON public.ai_provider_configs;
CREATE POLICY "ai_provider_configs_delete_super_admin" ON public.ai_provider_configs FOR DELETE
    TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin'));

-- ===== ai_conversations =====
CREATE TABLE IF NOT EXISTS public.ai_conversations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    title text NOT NULL DEFAULT 'محادثة جديدة',
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_id ON public.ai_conversations(user_id);

ALTER TABLE public.ai_conversations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_conversations_all_own" ON public.ai_conversations;
CREATE POLICY "ai_conversations_all_own" ON public.ai_conversations FOR ALL
    TO authenticated
    USING (user_id = auth.uid())
    WITH CHECK (user_id = auth.uid());

-- ===== ai_messages =====
CREATE TABLE IF NOT EXISTS public.ai_messages (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES public.ai_conversations(id) ON DELETE CASCADE,
    role text NOT NULL CHECK (role = ANY (ARRAY['user'::text, 'assistant'::text])),
    content text NOT NULL,
    provider text,
    created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation_id ON public.ai_messages(conversation_id);

ALTER TABLE public.ai_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_messages_all_own" ON public.ai_messages;
CREATE POLICY "ai_messages_all_own" ON public.ai_messages FOR ALL
    TO authenticated
    USING (conversation_id IN (SELECT id FROM ai_conversations WHERE user_id = auth.uid()))
    WITH CHECK (conversation_id IN (SELECT id FROM ai_conversations WHERE user_id = auth.uid()));
