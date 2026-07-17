/*
# دوال اعتماد / رفض طلبات الاشتراك — الجزء الثالث (لوحة إدارة الاشتراكات)

الاعتماد والرفض بيتم فقط عن طريق Super Admin (نفس التحقق المستخدم في كل
الجداول التانية)، والدالتين بيسجّلوا في subscription_logs ويبعتوا إشعار
داخل التطبيق للمستخدم صاحب الطلب (نفس جدول notifications الحالي).
*/

CREATE OR REPLACE FUNCTION approve_subscription_payment(p_payment_id uuid)
RETURNS void AS $$
DECLARE
    v_payment RECORD;
    v_months int;
    v_period_start date := CURRENT_DATE;
    v_period_end date;
    v_target_id uuid;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin') THEN
        RAISE EXCEPTION 'غير مصرح';
    END IF;

    SELECT * INTO v_payment FROM subscription_payments WHERE id = p_payment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'طلب الدفع غير موجود'; END IF;
    IF v_payment.status = 'approved' THEN RAISE EXCEPTION 'تم اعتماد هذا الطلب من قبل'; END IF;

    SELECT months INTO v_months FROM subscription_durations WHERE id = v_payment.duration_id;
    v_period_end := v_period_start + (v_months || ' months')::interval;

    -- تفعيل حساب الدافع نفسه
    UPDATE subscriptions SET
        status = 'active',
        duration_id = v_payment.duration_id,
        current_period_start = v_period_start,
        current_period_end = v_period_end,
        activated_by = auth.uid()
    WHERE user_id = v_payment.payer_user_id;

    -- تفعيل كل من تم اختياره ضمن نفس الطلب
    IF v_payment.included_user_ids IS NOT NULL THEN
        FOREACH v_target_id IN ARRAY v_payment.included_user_ids LOOP
            UPDATE subscriptions SET
                status = 'active',
                duration_id = v_payment.duration_id,
                current_period_start = v_period_start,
                current_period_end = v_period_end,
                activated_by = auth.uid()
            WHERE user_id = v_target_id;
        END LOOP;
    END IF;

    UPDATE subscription_payments SET
        status = 'approved',
        reviewed_by = auth.uid(),
        reviewed_at = now()
    WHERE id = p_payment_id;

    INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
    VALUES (
        v_payment.payer_user_id, 'subscription_approved', 'تم اعتماد اشتراكك',
        'تم اعتماد طلب الاشتراك وتفعيل الحساب بنجاح', 'subscription_payment', p_payment_id
    );

    PERFORM log_subscription_action('approved', v_payment.payer_user_id, p_payment_id, NULL);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION reject_subscription_payment(p_payment_id uuid, p_reason text)
RETURNS void AS $$
DECLARE
    v_payment RECORD;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin') THEN
        RAISE EXCEPTION 'غير مصرح';
    END IF;

    SELECT * INTO v_payment FROM subscription_payments WHERE id = p_payment_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'طلب الدفع غير موجود'; END IF;

    UPDATE subscription_payments SET
        status = 'rejected',
        rejection_reason = p_reason,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    WHERE id = p_payment_id;

    INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
    VALUES (
        v_payment.payer_user_id, 'subscription_rejected', 'تم رفض طلب الاشتراك',
        COALESCE(p_reason, 'برجاء رفع إيصال جديد'), 'subscription_payment', p_payment_id
    );

    PERFORM log_subscription_action('rejected', v_payment.payer_user_id, p_payment_id, p_reason);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION approve_subscription_payment(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION reject_subscription_payment(uuid, text) TO authenticated;
