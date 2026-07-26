-- إزالة كاملة لميزة "المساعد الشخصي الذكي" (AI Assistant) وكل ما يتعلق بها
-- فى قاعدة البيانات: الجداول، السياسات، الدوال (Functions)، والـ Triggers.
--
-- يحل هذا الملف محل الميجريشنز التالية التى كانت أنشأت هذه الكائنات (وتم
-- حذفها من مستودع الكود لأنها لم تعد مطلوبة):
--   - 033_ai_assistant_infrastructure
--   - 034_openrouter_dynamic_models (+ v2)
--   - 035_openrouter_dynamic_models_rpc
--   - 035_replace_ai_providers_with_free_ones
--
-- ملحوظة: DROP TABLE ... CASCADE يحذف تلقائياً كل الـ Policies والـ
-- Triggers والـ Indexes المرتبطة بكل جدول، فلا داعى لحذفها يدوياً.

-- 1) دوال RPC المرتبطة بكاش نماذج OpenRouter
DROP FUNCTION IF EXISTS public.refresh_openrouter_models_cache(jsonb);
DROP FUNCTION IF EXISTS public.record_openrouter_model_result(text, boolean, integer, text);

-- 2) دالة الـ Trigger الخاصة بجدولى OpenRouter (تُحذف تلقائياً مع الجداول،
--    لكن نحذفها صراحةً احتياطاً لأنها معرّفة بشكل مستقل)
DROP FUNCTION IF EXISTS public.set_ai_openrouter_updated_at();

-- 3) الجداول (بالترتيب العكسي لترتيب الإنشاء، احتراماً للـ Foreign Keys،
--    مع أن CASCADE يغنينا عن الترتيب أصلاً)
DROP TABLE IF EXISTS public.ai_messages CASCADE;
DROP TABLE IF EXISTS public.ai_conversations CASCADE;
DROP TABLE IF EXISTS public.ai_openrouter_state CASCADE;
DROP TABLE IF EXISTS public.ai_openrouter_models CASCADE;
DROP TABLE IF EXISTS public.ai_provider_configs CASCADE;
