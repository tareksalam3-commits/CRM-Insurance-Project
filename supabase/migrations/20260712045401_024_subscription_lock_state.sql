/*
# حالة القفل عند انتهاء الاشتراك — الجزء الرابع

بدل الاعتماد على Cron خارجي لتحديث حالة الاشتراكات المنتهية، الدالة دي بتحسب
"هل المستخدم مقفول دلوقتي؟" ديناميكياً من التواريخ الفعلية + مدة السماح،
وبتحدّث عمود status تلقائياً لما تكتشف انتهاء فعلي (self-healing)، فمفيش
حاجة تفضل قديمة. بتتنفذ مرة كل ما يفتح المستخدم التطبيق، فتكلفتها بسيطة جداً.
*/

CREATE OR REPLACE FUNCTION get_my_subscription_lock_state()
RETURNS TABLE(is_locked boolean, status text, period_end date, grace_period_days int)
AS $$
DECLARE
    v_sub RECORD;
    v_grace int;
    v_effective_end date;
    v_locked boolean := false;
BEGIN
    SELECT * INTO v_sub FROM subscriptions WHERE user_id = auth.uid();

    IF NOT FOUND THEN
        -- مفيش صف اشتراك (حالة غير متوقعة) — فتح آمن بدل قفل خاطئ
        RETURN QUERY SELECT false, 'active'::text, NULL::date, 0;
        RETURN;
    END IF;

    SELECT COALESCE(grace_period_days, 0) INTO v_grace FROM subscription_settings LIMIT 1;
    v_grace := COALESCE(v_grace, 0);

    IF v_sub.status = 'suspended' THEN
        v_locked := true;
        v_effective_end := v_sub.current_period_end;

    ELSIF v_sub.status IN ('pending_payment', 'expired') THEN
        v_locked := true;
        v_effective_end := COALESCE(v_sub.current_period_end, v_sub.trial_end_date);

    ELSIF v_sub.status = 'trial' THEN
        v_effective_end := v_sub.trial_end_date;
        v_locked := v_effective_end IS NOT NULL AND (CURRENT_DATE - v_effective_end) > v_grace;
        IF v_locked THEN
            UPDATE subscriptions SET status = 'pending_payment' WHERE user_id = auth.uid();
        END IF;

    ELSIF v_sub.status = 'active' THEN
        v_effective_end := v_sub.current_period_end;
        v_locked := v_effective_end IS NOT NULL AND (CURRENT_DATE - v_effective_end) > v_grace;
        IF v_locked THEN
            UPDATE subscriptions SET status = 'expired' WHERE user_id = auth.uid();
        END IF;
    END IF;

    RETURN QUERY SELECT v_locked, v_sub.status::text, v_effective_end, v_grace;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_my_subscription_lock_state() TO authenticated;
