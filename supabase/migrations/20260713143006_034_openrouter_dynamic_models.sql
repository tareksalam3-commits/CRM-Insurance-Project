-- [ملف مُعاد بناؤه من الحالة الفعلية لقاعدة البيانات الحية بتاريخ 2026-07-16
--  عبر Supabase MCP — لم يكن موجودًا فى نسخة المستودع الأصلية]
--
-- كاش محلي لقائمة نماذج OpenRouter المجانية (:free) مع إحصاءات أداء كل
-- نموذج، وحالة عامة (Singleton) لمدير النماذج الديناميكي. تُدار بالكامل
-- من Edge Function ai-assistant. معزولة تمامًا عن جدول ai_provider_configs.

CREATE TABLE IF NOT EXISTS public.ai_openrouter_models (
    id text PRIMARY KEY,
    name text,
    context_length integer,
    is_excluded boolean NOT NULL DEFAULT false,
    is_preferred boolean NOT NULL DEFAULT false,
    success_count integer NOT NULL DEFAULT 0,
    failure_count integer NOT NULL DEFAULT 0,
    consecutive_failures integer NOT NULL DEFAULT 0,
    avg_latency_ms integer,
    last_success_at timestamptz,
    last_failure_at timestamptz,
    last_failure_reason text,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_openrouter_models_excluded ON public.ai_openrouter_models(is_excluded);
CREATE INDEX IF NOT EXISTS idx_ai_openrouter_models_last_seen ON public.ai_openrouter_models(last_seen_at);

ALTER TABLE public.ai_openrouter_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_openrouter_models_select_super_admin" ON public.ai_openrouter_models;
CREATE POLICY "ai_openrouter_models_select_super_admin" ON public.ai_openrouter_models FOR SELECT
    USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin'));

DROP POLICY IF EXISTS "ai_openrouter_models_update_super_admin" ON public.ai_openrouter_models;
CREATE POLICY "ai_openrouter_models_update_super_admin" ON public.ai_openrouter_models FOR UPDATE
    USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin'));

CREATE TABLE IF NOT EXISTS public.ai_openrouter_state (
    id boolean PRIMARY KEY DEFAULT true CHECK (id),
    current_model text REFERENCES public.ai_openrouter_models(id),
    last_models_refresh_at timestamptz,
    last_health_check_at timestamptz,
    total_models_count integer NOT NULL DEFAULT 0,
    status text NOT NULL DEFAULT 'unknown',
    last_error text,
    updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.ai_openrouter_state IS
  'صف واحد فقط (Singleton) يحمل الحالة العامة لمدير نماذج OpenRouter الديناميكي.';

ALTER TABLE public.ai_openrouter_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_openrouter_state_select_super_admin" ON public.ai_openrouter_state;
CREATE POLICY "ai_openrouter_state_select_super_admin" ON public.ai_openrouter_state FOR SELECT
    USING (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin'));

INSERT INTO public.ai_openrouter_state (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
