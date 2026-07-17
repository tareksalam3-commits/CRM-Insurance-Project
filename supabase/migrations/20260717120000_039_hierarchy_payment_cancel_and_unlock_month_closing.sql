-- ============================================================
-- 1) صلاحية إلغاء السداد: تعمل بالكامل بالنظام الهرمي (Hierarchy Scope)
--    بدلاً من قائمة أدوار ثابتة (كانت تمنح general_supervisor و supervisor
--    صلاحية على كل النظام بلا أي تقييد، ولم تكن تمنح group_leader أي شيء).
--
--    القاعدة الجديدة موحّدة لكل الأدوار: يمكن إلغاء أي عملية سداد طالما أن
--    مالك الوثيقة (owner_id) ضمن نطاق get_user_subtree(auth.uid()) الخاص
--    بالمستخدم الحالي. بما أن get_user_subtree ترجع المستخدم نفسه + كل من
--    تحته فى الهيكل الإداري، فهذا يحقق تلقائياً:
--      - Agent / Premium Agent  → نفسه فقط (إنتاجه الشخصي)
--      - Group Leader           → نفسه + كل أعضاء فريقه
--      - Supervisor              → نطاقه الإداري بالكامل
--      - General Supervisor      → نطاقه الإداري بالكامل
--      - Development Manager     → نطاقه الإداري بالكامل
--      - Super Admin              → كل النظام (هو جذر الهيكل الإداري)
--    كما تم حذف شرط "منفذ السداد = من يلغي السداد" القديم بالكامل.
-- ============================================================
DROP POLICY IF EXISTS "payments_update_cancel" ON public.payments;
CREATE POLICY "payments_update_cancel" ON public.payments FOR UPDATE
    TO authenticated
    USING (
        installment_id IN (
            SELECT i.id FROM installments i
            JOIN policies p ON i.policy_id = p.id
            WHERE p.owner_id IN (SELECT unnest(get_user_subtree(auth.uid())))
        )
    )
    WITH CHECK (
        installment_id IN (
            SELECT i.id FROM installments i
            JOIN policies p ON i.policy_id = p.id
            WHERE p.owner_id IN (SELECT unnest(get_user_subtree(auth.uid())))
        )
    );

-- ============================================================
-- 2) تقفيل الشهر: لم يعد يمنع تسجيل أو إلغاء السداد إطلاقاً.
--    تقفيل الشهر أصبح لأغراض التقارير والمتابعة فقط.
-- ============================================================

-- 2.1) حذف الـ trigger + الدالة التي كانت تمنع تسجيل سداد جديد فى شهر مقفل
DROP TRIGGER IF EXISTS before_payment_insert_check_month ON public.payments;
DROP FUNCTION IF EXISTS public.check_payment_month_not_closed();

-- 2.2) إزالة فحص "الشهر مقفل" من دالة إلغاء سداد القسط (offline-first RPC)
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
;
