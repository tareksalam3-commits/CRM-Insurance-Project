-- تعديل: قسط معاده يوم ١ في الشهر متبقاش متأخر إلا بعد شهر كامل (يعني في ١ الشهر اللي بعده)
-- بدل ما كان بيتحول لمتأخر بمجرد ما يعدي يوم واحد بس على تاريخ الاستحقاق
CREATE OR REPLACE FUNCTION public.update_overdue_installments()
RETURNS void AS $$
BEGIN
    UPDATE installments SET status = 'overdue', updated_at = now()
    WHERE status = 'pending' AND due_date < CURRENT_DATE - interval '1 month';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
;
