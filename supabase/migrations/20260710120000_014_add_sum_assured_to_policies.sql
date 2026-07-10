/*
# Add Sum Assured (مبلغ التأمين) to Policies

1. Change
   - Add `sum_assured` (decimal(12,2), nullable) to `policies`.
   - Column is nullable at the database level on purpose: existing policies
     keep working with no data change and no error. The application layer
     enforces this field as required only when creating a NEW policy; when
     editing an existing policy that doesn't have it yet, the user fills it
     in through the edit form.
   - This is purely an additive column change — no existing rows are
     touched, no triggers/functions that generate installments or policies
     are modified, so current data and behavior are unaffected.

2. Security
   - No RLS changes needed; existing policies table RLS already covers all
     columns.
*/

ALTER TABLE public.policies ADD COLUMN IF NOT EXISTS sum_assured decimal(12,2);

COMMENT ON COLUMN public.policies.sum_assured IS 'مبلغ التأمين (Sum Assured) - إلزامي للوثائق الجديدة من طبقة التطبيق، ويبقى فارغاً للوثائق القديمة حتى يتم إدخاله عند التعديل';
