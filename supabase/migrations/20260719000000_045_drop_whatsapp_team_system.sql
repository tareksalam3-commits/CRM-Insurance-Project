-- 045: إزالة نهائية لنظام "واتساب الفريق" بالكامل من قاعدة البيانات.
-- يحذف الجداول (whatsapp_templates, whatsapp_log) وكل ما يتبعها من فهارس،
-- سياسات RLS، trigger، والـ function الخاصة بها فقط. لا يمس أي جدول أو
-- دالة يستخدمها النظام الأساسي (users, get_user_subtree، ...إلخ).

-- جدول whatsapp_log يعتمد على whatsapp_templates عبر foreign key، فيُحذف أولاً
drop table if exists public.whatsapp_log cascade;
drop table if exists public.whatsapp_templates cascade;

-- الدالة المخصصة لتحديث updated_at الخاصة بجدول whatsapp_templates فقط
drop function if exists public.set_whatsapp_templates_updated_at() cascade;
