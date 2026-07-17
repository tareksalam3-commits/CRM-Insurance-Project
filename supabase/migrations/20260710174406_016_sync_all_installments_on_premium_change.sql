CREATE OR REPLACE FUNCTION public.regenerate_installments()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.premium_amount IS DISTINCT FROM NEW.premium_amount THEN
        UPDATE installments
        SET amount = NEW.premium_amount,
            updated_at = now()
        WHERE policy_id = NEW.id;

        UPDATE payments
        SET amount = NEW.premium_amount
        WHERE is_cancelled = false
          AND installment_id IN (
              SELECT id FROM installments WHERE policy_id = NEW.id
          );
    END IF;

    IF OLD.start_date IS DISTINCT FROM NEW.start_date
       OR OLD.payment_method IS DISTINCT FROM NEW.payment_method THEN

        DELETE FROM installments
        WHERE policy_id = NEW.id
        AND status = 'pending';

        PERFORM generate_installments(
            NEW.id, NEW.start_date, NEW.payment_method, NEW.premium_amount
        );
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
;
