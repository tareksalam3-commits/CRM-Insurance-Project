-- Phase 5 (مراجعة نهائية قبل الإصدار): تنظيف دوال قاعدة بيانات يتيمة
-- خلّفتها ميزة "المساعد الذكي" المحذوفة (migration 065)، وتثبيت search_path
-- على دوال SECURITY DEFINER المتبقية التى لم يُثبَّت عليها من قبل.
--
-- 1) migration 065 حذفت جداول ودوال المساعد القديمة (openrouter/ai_messages...)
--    لكنها لم تحذف الدوال المرتبطة بـ "نطاق تحليل المساعد" التى أضافتها
--    migrations 049/055 لاحقاً — وهذه الدوال لم يعد يستدعيها أي كود فى
--    الواجهة الأمامية أو أي Edge Function بعد حذف الميزة بالكامل.
--    (تم التحقق: لا يوجد أي مرجع لها فى src/ أو supabase/functions/)

DROP FUNCTION IF EXISTS public.assistant_scoped_installments(installment_status, date);
DROP FUNCTION IF EXISTS public.assistant_scoped_customers(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.assistant_scoped_policies(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.assistant_scoped_payments(date, date, timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.assistant_scoped_users();
DROP FUNCTION IF EXISTS public.get_assistant_scope_ids();
DROP FUNCTION IF EXISTS public.find_ancestor_by_role_branch_aware(uuid, uuid, user_role);
DROP FUNCTION IF EXISTS public.find_ancestor_by_role(uuid, user_role);

-- 2) تثبيت search_path على دوال SECURITY DEFINER أُنشئت لاحقاً (بعد
--    migration 011 التى ثبّتت الدفعة الأولى) ولم يُثبَّت عليها من قبل، لمنع
--    احتمال search_path hijacking.

ALTER FUNCTION public.log_subscription_action(text, uuid, uuid, text) SET search_path = public;
ALTER FUNCTION public.assign_initial_subscription() SET search_path = public;
ALTER FUNCTION public.get_payable_subordinates(uuid) SET search_path = public;
ALTER FUNCTION public.get_my_subscription_lock_state() SET search_path = public;
