-- إضافة بيانات "طلب التأمين" لصفحة العملاء: مبلغ التأمين، طريقة السداد،
-- والعربون. الهدف: عند إصدار وثيقة لاحقاً لنفس العميل، يتم تعبئة مبلغ
-- التأمين وطريقة السداد تلقائياً من بيانات العميل بدل إدخالهما يدوياً كل
-- مرة (الوكيل هيدخل بس القسط الصافي وتاريخ البداية ورقم الوثيقة والباقي).
--
-- الأعمدة الجديدة nullable عمداً على مستوى قاعدة البيانات (رغم إنها إجبارية
-- فى فورم "إضافة عميل جديد" فى الواجهة) حتى لا تتأثر مسارات أخرى موجودة
-- بالفعل بتنشئ/تستورد عملاء (مثل استيراد البيانات القديم) ولا تملك هذه
-- القيم — بدون أي تغيير فى منطق تلك المسارات.

ALTER TABLE customers
    ADD COLUMN IF NOT EXISTS insurance_amount numeric(12,2),
    ADD COLUMN IF NOT EXISTS payment_method payment_method,
    ADD COLUMN IF NOT EXISTS deposit_amount numeric(12,2);

-- ===== تحديث دوال RPC الخاصة بإضافة/تعديل عميل لدعم الحقول الجديدة =====
-- (لازم Drop بالتوقيع القديم أولاً لأن تغيير عدد الباراميترات بيعتبره
-- Postgres دالة overload جديدة مش نفس الدالة القديمة إن استخدمنا Replace فقط)

DROP FUNCTION IF EXISTS public.create_customer_op(
    uuid, text, text, text, text, date, text, marital_status, uuid
);

CREATE OR REPLACE FUNCTION public.create_customer_op(
    p_operation_id uuid,
    p_name text,
    p_national_id text,
    p_phone text,
    p_address text,
    p_birth_date date,
    p_occupation text,
    p_marital_status marital_status,
    p_owner_id uuid,
    p_insurance_amount numeric DEFAULT NULL,
    p_payment_method payment_method DEFAULT NULL,
    p_deposit_amount numeric DEFAULT NULL
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
    INSERT INTO customers (
      name, national_id, phone, address, birth_date, occupation, marital_status, owner_id,
      insurance_amount, payment_method, deposit_amount
    )
    VALUES (
      p_name, p_national_id, p_phone, p_address, p_birth_date, p_occupation, p_marital_status, p_owner_id,
      p_insurance_amount, p_payment_method, p_deposit_amount
    )
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

DROP FUNCTION IF EXISTS public.update_customer_op(
    uuid, uuid, timestamptz, text, text, text, text, date, text, marital_status, uuid
);

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
    p_owner_id uuid,
    p_insurance_amount numeric DEFAULT NULL,
    p_payment_method payment_method DEFAULT NULL,
    p_deposit_amount numeric DEFAULT NULL
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
      insurance_amount = p_insurance_amount,
      payment_method = p_payment_method,
      deposit_amount = p_deposit_amount,
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
