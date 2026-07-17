-- [ملف مُعاد بناؤه من الحالة الفعلية لقاعدة البيانات الحية بتاريخ 2026-07-16
--  عبر Supabase MCP — لم يكن موجودًا فى نسخة المستودع الأصلية]
--
-- دالتا RPC "atomic" لدعم Offline-first فى سداد وإلغاء سداد الأقساط،
-- بنفس منطق idempotency (operation_id) المستخدم فى create/update_*_op،
-- مع فحص تعارض إضافي: لو القسط اتسدد بالفعل من مستخدم/جهاز آخر (status='paid')
-- أثناء انقطاع الاتصال، العملية بترجع تعارض واضح بدل تسجيل سداد مكرر.

CREATE OR REPLACE FUNCTION public.pay_installment_op(
    p_operation_id uuid,
    p_installment_id uuid,
    p_amount numeric,
    p_paid_at timestamptz,
    p_payment_month date
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing sync_operations;
  v_payment_id uuid;
  v_status installment_status;
BEGIN
  SELECT * INTO v_existing FROM sync_operations WHERE operation_id = p_operation_id;
  IF FOUND THEN
    IF v_existing.status = 'success' THEN
      RETURN v_existing.result;
    ELSE
      RETURN jsonb_build_object('error', COALESCE(v_existing.error_message, 'فشلت العملية سابقاً'));
    END IF;
  END IF;

  BEGIN
    SELECT status INTO v_status FROM installments WHERE id = p_installment_id FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO sync_operations (operation_id, operation_type, entity_type, entity_id, user_id, status, error_message)
      VALUES (p_operation_id, 'pay_installment', 'installment', p_installment_id, auth.uid(), 'conflict', 'القسط غير موجود')
      ON CONFLICT (operation_id) DO NOTHING;
      RETURN jsonb_build_object('conflict', true, 'error', 'القسط غير موجود');
    END IF;

    IF v_status = 'paid' THEN
      INSERT INTO sync_operations (operation_id, operation_type, entity_type, entity_id, user_id, status, error_message)
      VALUES (p_operation_id, 'pay_installment', 'installment', p_installment_id, auth.uid(), 'conflict', 'تم سداد هذا القسط بواسطة مستخدم آخر بالفعل')
      ON CONFLICT (operation_id) DO NOTHING;
      RETURN jsonb_build_object('conflict', true, 'error', 'تم سداد هذا القسط بواسطة مستخدم آخر بالفعل');
    END IF;

    INSERT INTO payments (installment_id, amount, paid_by_user_id, paid_at, payment_month)
    VALUES (p_installment_id, p_amount, auth.uid(), p_paid_at, p_payment_month)
    RETURNING id INTO v_payment_id;

    PERFORM log_activity('payment_create'::action_type, 'installment', p_installment_id);

    INSERT INTO sync_operations (operation_id, operation_type, entity_type, entity_id, user_id, status, result)
    VALUES (p_operation_id, 'pay_installment', 'installment', p_installment_id, auth.uid(), 'success',
            jsonb_build_object('payment_id', v_payment_id))
    ON CONFLICT (operation_id) DO NOTHING;

    RETURN jsonb_build_object('payment_id', v_payment_id);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO sync_operations (operation_id, operation_type, entity_type, entity_id, user_id, status, error_message)
    VALUES (p_operation_id, 'pay_installment', 'installment', p_installment_id, auth.uid(), 'failed', SQLERRM)
    ON CONFLICT (operation_id) DO NOTHING;
    RAISE;
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.cancel_installment_payment_op(
    p_operation_id uuid,
    p_installment_id uuid,
    p_cancel_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing sync_operations;
  v_installment installments;
  v_payment_id uuid;
  v_month_start date;
  v_is_closed boolean;
  v_reverted_status installment_status;
BEGIN
  SELECT * INTO v_existing FROM sync_operations WHERE operation_id = p_operation_id;
  IF FOUND THEN
    IF v_existing.status = 'success' THEN
      RETURN v_existing.result;
    ELSE
      RETURN jsonb_build_object('error', COALESCE(v_existing.error_message, 'فشلت العملية سابقاً'));
    END IF;
  END IF;

  BEGIN
    SELECT * INTO v_installment FROM installments WHERE id = p_installment_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'القسط غير موجود');
    END IF;

    v_month_start := date_trunc('month', COALESCE(v_installment.paid_at, now()))::date;
    SELECT is_month_closed(v_month_start) INTO v_is_closed;

    IF v_is_closed THEN
      INSERT INTO sync_operations (operation_id, operation_type, entity_type, entity_id, user_id, status, error_message)
      VALUES (p_operation_id, 'cancel_installment_payment', 'installment', p_installment_id, auth.uid(), 'conflict', 'لا يمكن إلغاء السداد لشهر مقفل')
      ON CONFLICT (operation_id) DO NOTHING;
      RETURN jsonb_build_object('error', 'لا يمكن إلغاء السداد لشهر مقفل');
    END IF;

    SELECT id INTO v_payment_id FROM payments
      WHERE installment_id = p_installment_id AND is_cancelled = false
      LIMIT 1;

    IF v_payment_id IS NULL THEN
      IF NOT v_installment.is_historical THEN
        INSERT INTO sync_operations (operation_id, operation_type, entity_type, entity_id, user_id, status, error_message)
        VALUES (p_operation_id, 'cancel_installment_payment', 'installment', p_installment_id, auth.uid(), 'conflict', 'لم يتم العثور على السداد')
        ON CONFLICT (operation_id) DO NOTHING;
        RETURN jsonb_build_object('error', 'لم يتم العثور على السداد');
      END IF;

      v_reverted_status := CASE WHEN v_installment.due_date < CURRENT_DATE
        THEN 'overdue'::installment_status ELSE 'pending'::installment_status END;

      UPDATE installments
      SET status = v_reverted_status, paid_at = NULL, is_historical = false, updated_at = now()
      WHERE id = p_installment_id;

      PERFORM log_activity('payment_cancel'::action_type, 'installment', p_installment_id);

      INSERT INTO sync_operations (operation_id, operation_type, entity_type, entity_id, user_id, status, result)
      VALUES (p_operation_id, 'cancel_installment_payment', 'installment', p_installment_id, auth.uid(), 'success',
              jsonb_build_object('reverted_status', v_reverted_status))
      ON CONFLICT (operation_id) DO NOTHING;

      RETURN jsonb_build_object('success', true);
    END IF;

    UPDATE payments
    SET is_cancelled = true, cancelled_at = now(), cancelled_by_user_id = auth.uid(),
        cancel_reason = COALESCE(NULLIF(p_cancel_reason, ''), 'إلغاء السداد')
    WHERE id = v_payment_id;

    PERFORM log_activity('payment_cancel'::action_type, 'installment', p_installment_id);

    INSERT INTO sync_operations (operation_id, operation_type, entity_type, entity_id, user_id, status, result)
    VALUES (p_operation_id, 'cancel_installment_payment', 'installment', p_installment_id, auth.uid(), 'success',
            jsonb_build_object('payment_id', v_payment_id))
    ON CONFLICT (operation_id) DO NOTHING;

    RETURN jsonb_build_object('success', true);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO sync_operations (operation_id, operation_type, entity_type, entity_id, user_id, status, error_message)
    VALUES (p_operation_id, 'cancel_installment_payment', 'installment', p_installment_id, auth.uid(), 'failed', SQLERRM)
    ON CONFLICT (operation_id) DO NOTHING;
    RAISE;
  END;
END;
$function$;
