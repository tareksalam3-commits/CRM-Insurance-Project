-- [ملف مُعاد بناؤه من الحالة الفعلية لقاعدة البيانات الحية بتاريخ 2026-07-16
--  عبر Supabase MCP — لم يكن موجودًا فى نسخة المستودع الأصلية]
--
-- إضافة عمود deleted_at لجدول users لدعم الحذف الناعم (Soft Delete):
-- المستخدم المحذوف يختفي من صفحة المستخدمين والهيكل الوظيفي، ولا يقدر
-- يسجل دخول، لكن بياناته التاريخية (الوثائق/العملاء اللي أنشأها) تفضل
-- محفوظة زي ما هي.

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

COMMENT ON COLUMN public.users.deleted_at IS
  'Soft-delete marker. When set, the user is hidden from the Users list and Org Structure, cannot log in, and cannot be assigned new records. Historical data referencing this user is preserved as-is.';
