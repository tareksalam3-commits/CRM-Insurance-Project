-- [ملف مُعاد بناؤه من الحالة الفعلية لقاعدة البيانات الحية بتاريخ 2026-07-16
--  عبر Supabase MCP — لم يكن موجودًا فى نسخة المستودع الأصلية]
--
-- إندكسات إضافية لتحسين أداء استعلامات لوحة التحكم والتقارير.

CREATE INDEX IF NOT EXISTS idx_policies_created_at ON public.policies USING btree (created_at);
CREATE INDEX IF NOT EXISTS idx_policies_policy_type ON public.policies USING btree (policy_type);
