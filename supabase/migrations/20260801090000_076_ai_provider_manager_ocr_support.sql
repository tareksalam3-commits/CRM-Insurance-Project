-- ============================================================================
-- إعادة تنظيم منظومة الذكاء الاصطناعي لتصبح "Provider Manager" قابلة للتوسع
-- + إضافة دعم OCR.Space كمزود استخراج نص (OCR) بنفس فلسفة مزودي AI الحالية.
-- ============================================================================
-- لا يوجد أي حذف أو تعديل مدمّر هنا: كل ما يحدث هو توسعة لجدول ai_providers
-- الموجود (074_ai_infrastructure) بعمود جديد يُميّز نوع المزود (ai / ocr)،
-- وتوسعة الـ CHECK constraint على اسم المزود ليسمح بـ 'ocrspace'، مع تحديث
-- دالة ai_get_settings() لتُعيد النوع الجديد أيضاً حتى تستطيع صفحة الإعدادات
-- تقسيم العرض (مزودو AI / مزودو OCR) دون أي تغيير فى شكل أو تصميم الصفحة.
--
-- كل الصفوف والدوال الموجودة مسبقاً (openrouter/groq/cloudflare، ai_settings،
-- ai_upsert_provider، ai_set_enabled) تبقى كما هى تماماً بدون أي تعديل فى
-- سلوكها — هذا الملف إضافى بالكامل (Additive Only).
-- ============================================================================

-- 1) عمود نوع المزود: 'ai' لمزودي توليد النصوص/تحليل الصور، 'ocr' لمزودي
--    استخراج النص من الصور/PDF. المزودات الثلاثة الحالية كلها 'ai' افتراضياً
--    (القيمة الافتراضية تحافظ على توافقها الكامل دون أي حاجة لتحديثها يدوياً).
ALTER TABLE ai_providers
    ADD COLUMN IF NOT EXISTS provider_type text NOT NULL DEFAULT 'ai'
        CHECK (provider_type IN ('ai', 'ocr'));

CREATE INDEX IF NOT EXISTS idx_ai_providers_type ON ai_providers(provider_type);

-- 2) توسعة الـ CHECK constraint على اسم المزود ليسمح بإضافة 'ocrspace'
--    (وأي مزود مستقبلي يُضاف بنفس الطريقة: توسعة هذا الـ CHECK فقط).
ALTER TABLE ai_providers DROP CONSTRAINT IF EXISTS ai_providers_provider_check;
ALTER TABLE ai_providers
    ADD CONSTRAINT ai_providers_provider_check
    CHECK (provider IN ('openrouter', 'groq', 'cloudflare', 'ocrspace'));

-- نفس التوسعة على جدول كاش النماذج، تحسباً لاستخدامه مستقبلاً من مزود OCR
-- يدعم أكثر من محرك/نموذج (OCR.Space حالياً لا يحتاج هذا الجدول إطلاقاً).
ALTER TABLE ai_provider_models DROP CONSTRAINT IF EXISTS ai_provider_models_provider_check;
ALTER TABLE ai_provider_models
    ADD CONSTRAINT ai_provider_models_provider_check
    CHECK (provider IN ('openrouter', 'groq', 'cloudflare', 'ocrspace'));

-- 3) إضافة مزود OCR.Space معطّلاً افتراضياً (نفس أسلوب seed المزودات
--    الثلاثة الحالية فى 074_ai_infrastructure) — الأولوية 10 حتى لا تتعارض
--    أبداً مع ترقيم أولويات مزودي AI الحاليين (1/2/3).
INSERT INTO ai_providers (provider, display_name, enabled, priority, provider_type)
VALUES ('ocrspace', 'OCR.Space', false, 10, 'ocr')
ON CONFLICT (provider) DO NOTHING;

-- ============================================================================
-- تحديث RPC: ai_get_settings — إضافة provider_type لكل مزود فى الناتج فقط
-- (بدون أي تعديل فى باقي الحقول أو منطق الصلاحيات).
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
                    'provider_type', provider_type,
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
                ) ORDER BY provider_type ASC, priority ASC
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

COMMENT ON COLUMN ai_providers.provider_type IS 'نوع المزود: ai (توليد نصوص/تحليل صور) أو ocr (استخراج نص من صور/PDF). يُستخدم فقط لتقسيم العرض والاختيار داخل Provider Manager، ولا يغيّر أي صلاحية أو سلوك حالي.';
COMMENT ON FUNCTION ai_get_settings() IS 'يعرض حالة منظومة الذكاء الاصطناعي كاملة (مزودو AI وOCR معاً) لصفحة الإعدادات (super_admin فقط)، مع إخفاء مفاتيح الـ API.';
