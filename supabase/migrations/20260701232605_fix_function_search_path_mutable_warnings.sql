ALTER FUNCTION public.generate_installments(uuid, date, payment_method, numeric) SET search_path TO 'public';
ALTER FUNCTION public.update_overdue_installments() SET search_path TO 'public';
ALTER FUNCTION public.create_due_notifications() SET search_path TO 'public';
ALTER FUNCTION public.is_month_closed(date) SET search_path TO 'public';
ALTER FUNCTION public.regenerate_installments() SET search_path TO 'public';
;
