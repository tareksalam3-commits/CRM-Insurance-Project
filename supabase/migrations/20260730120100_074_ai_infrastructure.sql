-- ============================================================================
-- المرحلة الأولى: البنية الأساسية لمنظومة الذكاء الاصطناعي
-- ============================================================================
-- ثلاث جداول:
--   ai_settings         : صف واحد فقط (Singleton) — الحالة العامة للمنظومة.
--   ai_providers         : إعدادات كل مزود خدمة (مفاتيح، أولوية، حالة).
--   ai_provider_models   : كاش بأحدث النماذج المجانية المتاحة لكل مزود.
--
-- الأمان:
--   - كل الجداول محمية بـ RLS ومقصورة بالكامل (SELECT/INSERT/UPDATE/DELETE)
--     على super_admin فقط، بنفس أسلوب جدول branches (060_...).
--   - مفاتيح الـ API لا تُقرأ مباشرة من الفرونت إند؛ القراءة تتم فقط عبر
--     الدالة ai_get_settings() التى تُخفى المفتاح (تعرض آخر 4 خانات فقط).
--   - الاستدعاء الفعلي لمزودي الخدمة (تجربة الاتصال / جلب النماذج) يتم من
--     Edge Functions تستخدم service_role، فلا يخرج أي مفتاح للمتصفح إطلاقاً.
-- ============================================================================

-- 1) جدول الحالة العامة (Singleton)
CREATE TABLE IF NOT EXISTS ai_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    ai_enabled boolean NOT NULL DEFAULT false,
    active_provider text,
    active_model text,
    models_updated_at timestamptz,
    updated_at timestamptz NOT NULL DEFAULT now(),
    updated_by uuid REFERENCES users(id) ON DELETE SET NULL
);

-- 2) جدول مزودي الخدمة
CREATE TABLE IF NOT EXISTS ai_providers (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL UNIQUE CHECK (provider IN ('openrouter', 'groq', 'cloudflare')),
    display_name text NOT NULL,
    enabled boolean NOT NULL DEFAULT false,
    priority int NOT NULL DEFAULT 100,
    api_key text,
    account_id text,           -- مطلوب لـ Cloudflare AI فقط (Account ID)
    default_model text,        -- آخر نموذج مجاني تم اختياره تلقائياً لهذا المزود
    status text NOT NULL DEFAULT 'untested'
        CHECK (status IN ('untested', 'active', 'error', 'disabled')),
    last_error text,
    last_tested_at timestamptz,
    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ai_providers_priority ON ai_providers(priority);

-- 3) كاش النماذج المجانية لكل مزود
CREATE TABLE IF NOT EXISTS ai_provider_models (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    provider text NOT NULL CHECK (provider IN ('openrouter', 'groq', 'cloudflare')),
    model_id text NOT NULL,
    model_name text,
    context_length int,
    is_free boolean NOT NULL DEFAULT true,
    fetched_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (provider, model_id)
);

CREATE INDEX IF NOT EXISTS idx_ai_provider_models_provider ON ai_provider_models(provider);

-- Trigger عام لتحديث updated_at (نفس الدالة المستخدمة فى باقي المشروع)
DROP TRIGGER IF EXISTS trg_ai_settings_updated_at ON ai_settings;
CREATE TRIGGER trg_ai_settings_updated_at
    BEFORE UPDATE ON ai_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS trg_ai_providers_updated_at ON ai_providers;
CREATE TRIGGER trg_ai_providers_updated_at
    BEFORE UPDATE ON ai_providers
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ============================================================================
-- RLS: مقصورة بالكامل على super_admin
-- ============================================================================
ALTER TABLE ai_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_provider_models ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ai_settings_super_admin_only" ON ai_settings;
CREATE POLICY "ai_settings_super_admin_only" ON ai_settings FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "ai_providers_super_admin_only" ON ai_providers;
CREATE POLICY "ai_providers_super_admin_only" ON ai_providers FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "ai_provider_models_super_admin_only" ON ai_provider_models;
CREATE POLICY "ai_provider_models_super_admin_only" ON ai_provider_models FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

-- ============================================================================
-- بيانات أولية (Seed) — صف الإعدادات الوحيد + مزودو الخدمة الثلاثة معطّلين
-- ============================================================================
INSERT INTO ai_settings (ai_enabled)
SELECT false
WHERE NOT EXISTS (SELECT 1 FROM ai_settings);

INSERT INTO ai_providers (provider, display_name, enabled, priority)
VALUES
    ('openrouter', 'OpenRouter', false, 1),
    ('groq',       'Groq',       false, 2),
    ('cloudflare', 'Cloudflare AI', false, 3)
ON CONFLICT (provider) DO NOTHING;

-- ============================================================================
-- RPC: ai_get_settings — عرض حالة المنظومة كاملة (بمفاتيح مخفية جزئياً)
-- ============================================================================
CREATE OR REPLACE FUNCTION ai_get_settings()
RETURNS jsonb AS $$
DECLARE
    v_result jsonb;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin') THEN
        RAISE EXCEPTION 'غير مصرح: صفحة إعدادات الذكاء الاصطناعي متاحة لمدير النظام (Super Admin) فقط';
    END IF;

    SELECT jsonb_build_object(
        'settings', (
            SELECT jsonb_build_object(
                'ai_enabled', ai_enabled,
                'active_provider', active_provider,
                'active_model', active_model,
                'models_updated_at', models_updated_at,
                'updated_at', updated_at
            )
            FROM ai_settings
            LIMIT 1
        ),
        'providers', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'provider', provider,
                    'display_name', display_name,
                    'enabled', enabled,
                    'priority', priority,
                    'has_key', api_key IS NOT NULL AND api_key <> '',
                    'key_preview', CASE
                        WHEN api_key IS NOT NULL AND length(api_key) > 4
                            THEN '••••' || right(api_key, 4)
                        WHEN api_key IS NOT NULL AND api_key <> ''
                            THEN '••••'
                        ELSE NULL
                    END,
                    'has_account_id', account_id IS NOT NULL AND account_id <> '',
                    'default_model', default_model,
                    'status', status,
                    'last_error', last_error,
                    'last_tested_at', last_tested_at
                ) ORDER BY priority ASC
            ), '[]'::jsonb)
            FROM ai_providers
        ),
        'models', (
            SELECT COALESCE(jsonb_agg(
                jsonb_build_object(
                    'provider', provider,
                    'model_id', model_id,
                    'model_name', model_name,
                    'context_length', context_length,
                    'fetched_at', fetched_at
                ) ORDER BY provider ASC, model_name ASC
            ), '[]'::jsonb)
            FROM ai_provider_models
        )
    ) INTO v_result;

    RETURN v_result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- RPC: ai_set_enabled — تفعيل/تعطيل المنظومة بالكامل
-- ============================================================================
CREATE OR REPLACE FUNCTION ai_set_enabled(p_enabled boolean)
RETURNS void AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin') THEN
        RAISE EXCEPTION 'غير مصرح: هذا الإجراء متاح لمدير النظام (Super Admin) فقط';
    END IF;

    UPDATE ai_settings
    SET ai_enabled = p_enabled, updated_by = auth.uid();

    PERFORM log_activity('ai_settings_update', 'ai_settings', NULL,
        NULL, jsonb_build_object('ai_enabled', p_enabled));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- ============================================================================
-- RPC: ai_upsert_provider — تعديل إعدادات مزود (مفتاح/حساب/تفعيل/أولوية)
-- تمرير p_api_key كـ NULL يعنى "لا تغيّر المفتاح الحالي" (لأن الفرونت إند لا
-- يستقبل المفتاح الكامل أصلاً بعد أول قراءة، فقط معاينة مقنّعة).
-- تمرير نص فارغ '' صراحةً يعنى "امسح المفتاح".
-- ============================================================================
CREATE OR REPLACE FUNCTION ai_upsert_provider(
    p_provider text,
    p_enabled boolean DEFAULT NULL,
    p_priority int DEFAULT NULL,
    p_api_key text DEFAULT NULL,
    p_account_id text DEFAULT NULL,
    p_key_changed boolean DEFAULT false,
    p_account_id_changed boolean DEFAULT false
)
RETURNS void AS $$
DECLARE
    v_key_updated boolean := false;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin') THEN
        RAISE EXCEPTION 'غير مصرح: هذا الإجراء متاح لمدير النظام (Super Admin) فقط';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM ai_providers WHERE provider = p_provider) THEN
        RAISE EXCEPTION 'مزود خدمة غير معروف: %', p_provider;
    END IF;

    UPDATE ai_providers SET
        enabled = COALESCE(p_enabled, enabled),
        priority = COALESCE(p_priority, priority),
        api_key = CASE WHEN p_key_changed THEN NULLIF(p_api_key, '') ELSE api_key END,
        account_id = CASE WHEN p_account_id_changed THEN NULLIF(p_account_id, '') ELSE account_id END,
        status = CASE WHEN p_key_changed THEN 'untested' ELSE status END,
        last_error = CASE WHEN p_key_changed THEN NULL ELSE last_error END
    WHERE provider = p_provider;

    v_key_updated := p_key_changed;

    PERFORM log_activity('ai_provider_update', 'ai_providers', NULL, NULL,
        jsonb_build_object(
            'provider', p_provider,
            'enabled', p_enabled,
            'priority', p_priority,
            'key_updated', v_key_updated,
            'account_id_updated', p_account_id_changed
        ));
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

COMMENT ON FUNCTION ai_get_settings() IS 'يعرض حالة منظومة الذكاء الاصطناعي كاملة لصفحة الإعدادات (super_admin فقط)، مع إخفاء مفاتيح الـ API.';
COMMENT ON FUNCTION ai_set_enabled(boolean) IS 'تفعيل/تعطيل منظومة الذكاء الاصطناعي بالكامل (super_admin فقط).';
COMMENT ON FUNCTION ai_upsert_provider(text, boolean, int, text, text, boolean, boolean) IS 'تعديل إعدادات مزود ذكاء اصطناعي واحد (super_admin فقط). لا يُعاد عرض المفتاح أبداً بعد حفظه.';
