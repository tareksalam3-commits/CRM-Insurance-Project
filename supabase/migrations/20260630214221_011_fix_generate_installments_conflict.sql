CREATE OR REPLACE FUNCTION public.generate_installments(
    p_policy_id uuid,
    p_start_date date,
    p_payment_method payment_method,
    p_premium_amount numeric
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $function$
DECLARE
    v_installment_count int;
    v_months_interval int;
    v_installment_number int;
    v_due_date date;
    v_policy_nature policy_nature;
    v_current_month_start date := date_trunc('month', current_date)::date;
BEGIN
    SELECT nature INTO v_policy_nature FROM policies WHERE id = p_policy_id;

    CASE p_payment_method
        WHEN 'monthly' THEN
            v_installment_count := 12;
            v_months_interval := 1;
        WHEN 'quarterly' THEN
            v_installment_count := 4;
            v_months_interval := 3;
        WHEN 'semi_annual' THEN
            v_installment_count := 2;
            v_months_interval := 6;
        WHEN 'annual' THEN
            v_installment_count := 1;
            v_months_interval := 12;
    END CASE;

    FOR v_installment_number IN 1..v_installment_count LOOP
        v_due_date := p_start_date + (v_installment_number - 1) * interval '1 month' * v_months_interval;

        INSERT INTO installments (
            policy_id, installment_number, amount, due_date, is_first, is_historical
        ) VALUES (
            p_policy_id, v_installment_number, p_premium_amount, v_due_date,
            v_installment_number = 1,
            (v_policy_nature = 'existing' AND v_due_date < v_current_month_start)
        )
        ON CONFLICT (policy_id, installment_number) DO NOTHING;
        -- يتجاهل القسط لو موجود بالفعل (مثلاً قسط مدفوع) بدل ما يفشل بخطأ تكرار
    END LOOP;
END;
$function$;
