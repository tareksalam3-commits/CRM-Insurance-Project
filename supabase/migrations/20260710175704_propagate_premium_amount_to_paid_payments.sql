CREATE OR REPLACE FUNCTION public.generate_installments(
    p_policy_id uuid,
    p_start_date date,
    p_payment_method payment_method,
    p_premium_amount decimal
) RETURNS void AS $$
DECLARE
    v_installment_count int;
    v_months_interval int;
    v_installment_number int;
    v_due_date date;
BEGIN
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
        v_due_date := p_start_date + ((v_installment_number - 1) * v_months_interval || ' months')::interval;

        INSERT INTO installments (
            policy_id, installment_number, amount, due_date, is_first
        ) VALUES (
            p_policy_id, v_installment_number, p_premium_amount, v_due_date, v_installment_number = 1
        )
        ON CONFLICT (policy_id, installment_number)
        DO UPDATE SET
            amount = EXCLUDED.amount,
            due_date = EXCLUDED.due_date,
            updated_at = now();
    END LOOP;

    -- نشيل أي أقساط زيادة عن العدد الجديد ولسه معلقة بس
    DELETE FROM installments
    WHERE policy_id = p_policy_id
      AND installment_number > v_installment_count
      AND status = 'pending';

    -- نحدّث مبلغ الدفعة الفعلي (payments.amount) لأي قسط اتسدد بالفعل
    -- لنفس الوثيقة، عشان سجل التحصيل يعكس القيمة الجديدة للقسط
    UPDATE payments pay
    SET amount = p_premium_amount
    FROM installments inst
    WHERE pay.installment_id = inst.id
      AND inst.policy_id = p_policy_id
      AND inst.status = 'paid'
      AND pay.is_cancelled = false
      AND pay.amount IS DISTINCT FROM p_premium_amount;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
;
