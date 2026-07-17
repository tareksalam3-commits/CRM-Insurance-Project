CREATE OR REPLACE FUNCTION public.update_overdue_installments()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE installments SET status = 'overdue', updated_at = now()
    WHERE status = 'pending' AND due_date < CURRENT_DATE - interval '1 month';
END;
$function$;
;
