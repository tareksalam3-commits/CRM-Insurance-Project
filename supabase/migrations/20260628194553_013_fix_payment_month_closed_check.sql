-- إصلاح: منع تسجيل دفعة جديدة في شهر مُقفل (حماية على مستوى القاعدة، لا يمكن تجاوزها)
CREATE OR REPLACE FUNCTION check_payment_month_not_closed()
RETURNS TRIGGER AS $$
BEGIN
    IF is_month_closed(NEW.payment_month) THEN
        RAISE EXCEPTION 'لا يمكن تسجيل سداد لشهر مقفل. يرجى فتح الشهر أولاً من صفحة تقفيل الشهر.'
            USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DROP TRIGGER IF EXISTS before_payment_insert_check_month ON payments;
CREATE TRIGGER before_payment_insert_check_month
    BEFORE INSERT ON payments
    FOR EACH ROW
    WHEN (NEW.is_cancelled = false)
    EXECUTE FUNCTION check_payment_month_not_closed();
;
