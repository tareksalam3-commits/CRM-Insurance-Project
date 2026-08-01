-- ============================================================================
-- إضافة Google Gemini (عبر Google AI Studio) كمزود AI جديد يدعم قراءة الصور
-- (Vision) مباشرة — بديل اختياري لمسار OCR.Space لاستخراج النص من المستندات.
-- ============================================================================
-- إضافي بالكامل (Additive Only): لا حذف ولا تعديل فى أي صف أو دالة موجودة.
-- Gemini 1.5 Flash / Pro تدعم تحليل الصور مباشرة ضمن نفس الطلب (بدون حاجة
-- لخطوة OCR منفصلة)، فتُسجَّل هنا كمزود AI عادي (provider_type='ai') بعلامة
-- "يدعم الصور"، فيدخل تلقائياً ضمن نفس مسار الـ Fallback الحالي لمزودي AI:
-- لو مفعّل ومتصل، يُستخدَم حسب أولويته مثل أي مزود AI آخر — تماماً كما لو لم
-- ينجح استخراج OCR.Space أو كان معطّلاً (لا حاجة لأي تعديل فى منطق الاختيار
-- أو الـ Fallback نفسه، فقط تسجيل المزود الجديد فى الجدول).
-- ============================================================================

-- توسعة الـ CHECK constraint على اسم المزود ليسمح بإضافة 'gemini'
ALTER TABLE ai_providers DROP CONSTRAINT IF EXISTS ai_providers_provider_check;
ALTER TABLE ai_providers
    ADD CONSTRAINT ai_providers_provider_check
    CHECK (provider IN ('openrouter', 'groq', 'cloudflare', 'ocrspace', 'gemini'));

ALTER TABLE ai_provider_models DROP CONSTRAINT IF EXISTS ai_provider_models_provider_check;
ALTER TABLE ai_provider_models
    ADD CONSTRAINT ai_provider_models_provider_check
    CHECK (provider IN ('openrouter', 'groq', 'cloudflare', 'ocrspace', 'gemini'));

-- إضافة مزود Gemini معطّلاً افتراضياً (نفس أسلوب seed كل المزودات السابقة)
-- بأولوية 4 (بعد المزودات الثلاثة الحالية) حتى لا يُغيّر ترتيب أي مزود مفعّل
-- مسبقاً دون تدخل صريح من المستخدم؛ يمكن رفع أولويته لاحقاً من نفس صفحة
-- الإعدادات (حقل Priority) لو أراد جعله المزود المفضّل لقراءة الصور.
INSERT INTO ai_providers (provider, display_name, enabled, priority, provider_type)
VALUES ('gemini', 'Gemini (Google AI Studio)', false, 4, 'ai')
ON CONFLICT (provider) DO NOTHING;

COMMENT ON COLUMN ai_providers.provider IS 'اسم المزود: openrouter/groq/cloudflare/gemini لمزودي AI، ocrspace لمزودي OCR. لإضافة مزود جديد مستقبلاً: وسّع هذا الـ CHECK + أضف صف seed هنا فقط، دون أي تعديل فى الصفحات أو الـ Business Logic.';
