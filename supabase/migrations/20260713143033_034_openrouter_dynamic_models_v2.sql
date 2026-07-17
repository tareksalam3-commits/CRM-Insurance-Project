-- [ملف مُعاد بناؤه من الحالة الفعلية لقاعدة البيانات الحية بتاريخ 2026-07-16
--  عبر Supabase MCP — لم يكن موجودًا فى نسخة المستودع الأصلية]
--
-- Trigger لتحديث updated_at تلقائيًا على جدولي ai_openrouter_models
-- و ai_openrouter_state عند أي تعديل.

CREATE OR REPLACE FUNCTION public.set_ai_openrouter_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ai_openrouter_models_updated_at ON public.ai_openrouter_models;
CREATE TRIGGER trg_ai_openrouter_models_updated_at
    BEFORE UPDATE ON public.ai_openrouter_models
    FOR EACH ROW EXECUTE FUNCTION set_ai_openrouter_updated_at();

DROP TRIGGER IF EXISTS trg_ai_openrouter_state_updated_at ON public.ai_openrouter_state;
CREATE TRIGGER trg_ai_openrouter_state_updated_at
    BEFORE UPDATE ON public.ai_openrouter_state
    FOR EACH ROW EXECUTE FUNCTION set_ai_openrouter_updated_at();
