-- Add sum_assured (مبلغ التأمين) to policies — nullable, additive only.
-- Existing rows are left untouched (column defaults to NULL for them).
-- The application enforces this as required for NEW policies; existing
-- policies keep working and the field is filled in later via edit.
ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS sum_assured decimal(12,2);

COMMENT ON COLUMN public.policies.sum_assured IS 'مبلغ التأمين (Sum Assured) - إلزامي للوثائق الجديدة من طبقة التطبيق، ويبقى فارغاً للوثائق القديمة حتى يتم إدخاله عند التعديل';
;
