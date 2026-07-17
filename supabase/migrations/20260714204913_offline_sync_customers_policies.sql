-- [ملف مُعاد بناؤه من الحالة الفعلية لقاعدة البيانات الحية بتاريخ 2026-07-16
--  عبر Supabase MCP — لم يكن موجودًا فى نسخة المستودع الأصلية]
--
-- دوال RPC "atomic" لدعم Offline-first لصفحتي العملاء والوثائق: كل دالة
-- تستخدم operation_id فريد (idempotency key) عشان لو اتكررت نفس العملية
-- (retry بعد انقطاع الاتصال) ترجع نفس النتيجة القديمة بدل التنفيذ مرتين،
-- وتتحقق من تعارض التعديل المتزامن (optimistic concurrency عبر
-- expected_updated_at) فى حالتي التعديل.

CREATE OR REPLACE FUNCTION public.create_customer_op(
    p_operation_id uuid,
    p_name text,
    p_national_id text,
    p_phone text,
    p_address text,
    p_birth_date date,
    p_occupation text,
    p_marital_status marital_status,
    p_owner_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing sync_operations;
  v_customer_id uuid;
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
    INSERT INTO customers (name, national_id, phone, address, birth_date, occupation, marital_status, owner_id)
    VALUES (p_name, p_national_id, p_phone, p_address, p_birth_date, p_occupation, p_marital_status, p_owner_id)
    RETURNING id INTO v_customer_id;

    PERFORM log_activity('customer_create'::action_type, 'customer', v_customer_id);

    INSERT INTO sync_operations (operation_id, operation_type, entity_type, entity_id, user_id, status, result)
    VALUES (p_operation_id, 'create_customer', 'customer', v_customer_id, auth.uid(), 'success',
            jsonb_build_object('customer_id', v_customer_id))
    ON CONFLICT (operation_id) DO NOTHING;

    RETURN jsonb_build_object('customer_id', v_customer_id);
  EXCEPTION
    WHEN unique_violation THEN
      INSERT INTO sync_operations (operation_id, operation_type, entity_type, entity_id, user_id, status, error_message)
      VALUES (p_operation_id, 'create_customer', 'customer', NULL, auth.uid(), 'conflict', 'يوجد عميل مسجّل بنفس الرقم القومي بالفعل')
      ON CONFLICT (operation_id) DO NOTHING;
      RETURN jsonb_build_object('conflict', true, 'error', 'يوجد عميل مسجّل بنفس الرقم القومي بالفعل');
    WHEN OTHERS THEN
      INSERT INTO sync_operations (operation_id, operation_type, entity_type, entity_id, user_id, status, error_message)
      VALUES (p_operation_id, 'create_customer', 'customer', NULL, auth.uid(), 'failed', SQLERRM)
      ON CONFLICT (operation_id) DO NOTHING;
      RAISE;
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_customer_op(
    p_operation_id uuid,
    p_customer_id uuid,
    p_expected_updated_at timestamptz,
    p_name text,
    p_national_id text,
    p_phone text,
    p_address text,
    p_birth_date date,
    p_occupation text,
    p_marital_status marital_status,
    p_owner_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing sync_operations;
  v_current customers;
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
    SELECT * INTO v_current FROM customers WHERE id = p_customer_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'العميل غير موجود');
    END IF;

    IF p_expected_updated_at IS NOT NULL
       AND v_current.updated_at IS NOT NULL
       AND v_current.updated_at <> p_expected_updated_at THEN
      INSERT INTO sync_operations (operation_id, operation_type, entity_type, entity_id, user_id, status, error_message)
      VALUES (p_operation_id, 'update_customer', 'customer', p_customer_id, auth.uid(), 'conflict', 'تم تعديل بيانات هذا العميل من مستخدم آخر بعد آخر تحميل لديك')
      ON CONFLICT (operation_id) DO NOTHING;
      RETURN jsonb_build_object(
        'conflict', true,
        'error', 'تم تعديل بيانات هذا العميل من مستخدم آخر بعد آخر تحميل لديك',
        'server_data', to_jsonb(v_current)
      );
    END IF;

    UPDATE customers SET
      name = p_name,
      national_id = p_national_id,
      phone = p_phone,
      address = p_address,
      birth_date = p_birth_date,
      occupation = p_occupation,
      marital_status = p_marital_status,
      owner_id = p_owner_id,
      updated_at = now()
    WHERE id = p_customer_id;

    PERFORM log_activity('customer_update'::action_type, 'customer', p_customer_id, to_jsonb(v_current), NULL);

    INSERT INTO sync_operations (operation_id, operation_type, entity_type, entity_id, user_id, status, result)
    VALUES (p_operation_id, 'update_customer', 'customer', p_customer_id, auth.uid(), 'success',
            jsonb_build_object('customer_id', p_customer_id))
    ON CONFLICT (operation_id) DO NOTHING;

    RETURN jsonb_build_object('customer_id', p_customer_id);
  EXCEPTION
    WHEN unique_violation THEN
      INSERT INTO sync_operations (operation_id, operation_type, entity_type, entity_id, user_id, status, error_message)
      VALUES (p_operation_id, 'update_customer', 'customer', p_customer_id, auth.uid(), 'conflict', 'يوجد عميل آخر مسجّل بنفس الرقم القومي بالفعل')
      ON CONFLICT (operation_id) DO NOTHING;
      RETURN jsonb_build_object('conflict', true, 'error', 'يوجد عميل آخر مسجّل بنفس الرقم القومي بالفعل');
    WHEN OTHERS THEN
      INSERT INTO sync_operations (operation_id, operation_type, entity_type, entity_id, user_id, status, error_message)
      VALUES (p_operation_id, 'update_customer', 'customer', p_customer_id, auth.uid(), 'failed', SQLERRM)
      ON CONFLICT (operation_id) DO NOTHING;
      RAISE;
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_policy_op(
    p_operation_id uuid,
    p_policy_number text,
    p_customer_id uuid,
    p_policy_type policy_type,
    p_start_date date,
    p_payment_method payment_method,
    p_premium_amount numeric,
    p_sum_assured numeric,
    p_notes text,
    p_owner_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing sync_operations;
  v_policy_id uuid;
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
    INSERT INTO policies (policy_number, customer_id, policy_type, start_date, payment_method, premium_amount, sum_assured, notes, owner_id)
    VALUES (p_policy_number, p_customer_id, p_policy_type, p_start_date, p_payment_method, p_premium_amount, p_sum_assured, p_notes, p_owner_id)
    RETURNING id INTO v_policy_id;

    PERFORM generate_installments(v_policy_id, p_start_date, p_payment_method, p_premium_amount);
    PERFORM mark_historical_installments_paid(v_policy_id);
    PERFORM log_activity('policy_create'::action_type, 'policy', v_policy_id);

    INSERT INTO sync_operations (operation_id, operation_type, entity_type, entity_id, user_id, status, result)
    VALUES (p_operation_id, 'create_policy', 'policy', v_policy_id, auth.uid(), 'success',
            jsonb_build_object('policy_id', v_policy_id))
    ON CONFLICT (operation_id) DO NOTHING;

    RETURN jsonb_build_object('policy_id', v_policy_id);
  EXCEPTION
    WHEN unique_violation THEN
      INSERT INTO sync_operations (operation_id, operation_type, entity_type, entity_id, user_id, status, error_message)
      VALUES (p_operation_id, 'create_policy', 'policy', NULL, auth.uid(), 'conflict', 'رقم الوثيقة مستخدم بالفعل')
      ON CONFLICT (operation_id) DO NOTHING;
      RETURN jsonb_build_object('conflict', true, 'error', 'رقم الوثيقة مستخدم بالفعل');
    WHEN OTHERS THEN
      INSERT INTO sync_operations (operation_id, operation_type, entity_type, entity_id, user_id, status, error_message)
      VALUES (p_operation_id, 'create_policy', 'policy', NULL, auth.uid(), 'failed', SQLERRM)
      ON CONFLICT (operation_id) DO NOTHING;
      RAISE;
  END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_policy_op(
    p_operation_id uuid,
    p_policy_id uuid,
    p_expected_updated_at timestamptz,
    p_policy_number text,
    p_customer_id uuid,
    p_policy_type policy_type,
    p_start_date date,
    p_payment_method payment_method,
    p_premium_amount numeric,
    p_sum_assured numeric,
    p_notes text
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_existing sync_operations;
  v_current policies;
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
    SELECT * INTO v_current FROM policies WHERE id = p_policy_id;
    IF NOT FOUND THEN
      RETURN jsonb_build_object('error', 'الوثيقة غير موجودة');
    END IF;

    IF p_expected_updated_at IS NOT NULL
       AND v_current.updated_at IS NOT NULL
       AND v_current.updated_at <> p_expected_updated_at THEN
      INSERT INTO sync_operations (operation_id, operation_type, entity_type, entity_id, user_id, status, error_message)
      VALUES (p_operation_id, 'update_policy', 'policy', p_policy_id, auth.uid(), 'conflict', 'تم تعديل هذه الوثيقة من مستخدم آخر بعد آخر تحميل لديك')
      ON CONFLICT (operation_id) DO NOTHING;
      RETURN jsonb_build_object(
        'conflict', true,
        'error', 'تم تعديل هذه الوثيقة من مستخدم آخر بعد آخر تحميل لديك',
        'server_data', to_jsonb(v_current)
      );
    END IF;

    UPDATE policies SET
      policy_number = p_policy_number,
      customer_id = p_customer_id,
      policy_type = p_policy_type,
      start_date = p_start_date,
      payment_method = p_payment_method,
      premium_amount = p_premium_amount,
      sum_assured = p_sum_assured,
      notes = p_notes,
      updated_at = now()
    WHERE id = p_policy_id;

    PERFORM log_activity('policy_update'::action_type, 'policy', p_policy_id, to_jsonb(v_current), NULL);

    INSERT INTO sync_operations (operation_id, operation_type, entity_type, entity_id, user_id, status, result)
    VALUES (p_operation_id, 'update_policy', 'policy', p_policy_id, auth.uid(), 'success',
            jsonb_build_object('policy_id', p_policy_id))
    ON CONFLICT (operation_id) DO NOTHING;

    RETURN jsonb_build_object('policy_id', p_policy_id);
  EXCEPTION
    WHEN unique_violation THEN
      INSERT INTO sync_operations (operation_id, operation_type, entity_type, entity_id, user_id, status, error_message)
      VALUES (p_operation_id, 'update_policy', 'policy', p_policy_id, auth.uid(), 'conflict', 'رقم الوثيقة مستخدم بالفعل لوثيقة أخرى')
      ON CONFLICT (operation_id) DO NOTHING;
      RETURN jsonb_build_object('conflict', true, 'error', 'رقم الوثيقة مستخدم بالفعل لوثيقة أخرى');
    WHEN OTHERS THEN
      INSERT INTO sync_operations (operation_id, operation_type, entity_type, entity_id, user_id, status, error_message)
      VALUES (p_operation_id, 'update_policy', 'policy', p_policy_id, auth.uid(), 'failed', SQLERRM)
      ON CONFLICT (operation_id) DO NOTHING;
      RAISE;
  END;
END;
$function$;
