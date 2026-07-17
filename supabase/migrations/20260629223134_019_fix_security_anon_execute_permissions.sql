-- سحب صلاحية anon من الـ functions الحساسة
-- هذه الـ functions يجب أن تستدعيها المستخدمون المسجلون فقط (authenticated)

REVOKE EXECUTE ON FUNCTION public.check_is_admin() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_subtree(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM anon;
REVOKE EXECUTE ON FUNCTION public.log_activity(action_type, text, uuid, jsonb, jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION public.cancel_payment() FROM anon;
REVOKE EXECUTE ON FUNCTION public.check_payment_month_not_closed() FROM anon;
REVOKE EXECUTE ON FUNCTION public.create_due_notifications() FROM anon;
REVOKE EXECUTE ON FUNCTION public.generate_installments(uuid, date, payment_method, numeric) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_collection_report(date, date, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_dashboard_stats(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_target_progress(uuid, date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.is_month_closed(date) FROM anon;
REVOKE EXECUTE ON FUNCTION public.reactivate_policy(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.record_payment() FROM anon;
REVOKE EXECUTE ON FUNCTION public.regenerate_installments() FROM anon;
REVOKE EXECUTE ON FUNCTION public.suspend_policy(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.transfer_user(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.update_overdue_installments() FROM anon;

-- إضافة SET search_path على الـ functions الناقصة
CREATE OR REPLACE FUNCTION public.check_is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid()
    AND role IN ('super_admin', 'development_manager')
  );
END;
$$;
;
