CREATE OR REPLACE FUNCTION public.mark_historical_installments_paid(p_policy_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE installments
    SET status = 'paid',
        paid_at = due_date::timestamptz,
        is_historical = true,
        updated_at = now()
    WHERE policy_id = p_policy_id
      AND status = 'pending'
      AND due_date < date_trunc('month', CURRENT_DATE)::date;
END;
$function$;

COMMENT ON FUNCTION public.mark_historical_installments_paid(uuid) IS
'تُستدعى بعد generate_installments لأي وثيقة (إنشاء من التطبيق / استيراد / تعديل تاريخ البداية): أي قسط تاريخ استحقاقه قبل بداية الشهر الحالي يُعتبر مسدداً تلقائياً بتاريخ استحقاقه الأصلي ويُعلَّم is_historical، وتُترك أقساط الشهر الحالي كما هي (pending) لتعمل بمنطق النظام العادي.';

CREATE OR REPLACE FUNCTION public.import_policy_row(
    p_customer_name    text,
    p_national_id       text,
    p_phone             text,
    p_address           text,
    p_birth_date        date,
    p_occupation        text,
    p_marital_status     text,
    p_agent_name         text,
    p_policy_number      text,
    p_policy_type        text,
    p_sum_assured        numeric,
    p_premium_amount     numeric,
    p_payment_method     text,
    p_start_date         date,
    p_notes              text
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_caller_id     uuid := auth.uid();
    v_caller_role   user_role;
    v_agent_id      uuid;
    v_customer_id   uuid;
    v_policy_id     uuid;
    v_national_id   text;
BEGIN
    IF v_caller_id IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: يجب تسجيل الدخول';
    END IF;

    SELECT role INTO v_caller_role FROM users WHERE id = v_caller_id;
    IF v_caller_role IS NULL THEN
        RAISE EXCEPTION 'غير مصرح: مستخدم غير معروف';
    END IF;

    IF p_customer_name IS NULL OR btrim(p_customer_name) = '' THEN
        RAISE EXCEPTION 'اسم العميل مطلوب';
    END IF;
    IF p_agent_name IS NULL OR btrim(p_agent_name) = '' THEN
        RAISE EXCEPTION 'اسم الوكيل مطلوب';
    END IF;
    IF p_policy_number IS NULL OR btrim(p_policy_number) = '' THEN
        RAISE EXCEPTION 'رقم الوثيقة مطلوب';
    END IF;
    IF p_policy_type IS NULL OR btrim(p_policy_type) = '' THEN
        RAISE EXCEPTION 'نوع الوثيقة مطلوب';
    END IF;
    IF p_sum_assured IS NULL THEN
        RAISE EXCEPTION 'مبلغ التأمين مطلوب';
    END IF;
    IF p_premium_amount IS NULL THEN
        RAISE EXCEPTION 'قيمة القسط مطلوبة';
    END IF;
    IF p_payment_method IS NULL OR btrim(p_payment_method) = '' THEN
        RAISE EXCEPTION 'طريقة السداد مطلوبة';
    END IF;
    IF p_start_date IS NULL THEN
        RAISE EXCEPTION 'تاريخ بداية التأمين مطلوب';
    END IF;

    SELECT id INTO v_agent_id
    FROM users
    WHERE btrim(lower(name)) = btrim(lower(p_agent_name))
      AND is_active = true
      AND role IN ('agent', 'premium_agent')
      AND id = ANY(get_user_subtree(v_caller_id))
    LIMIT 1;

    IF v_agent_id IS NULL THEN
        RAISE EXCEPTION 'اسم الوكيل غير موجود: %', p_agent_name;
    END IF;

    v_national_id := NULLIF(btrim(coalesce(p_national_id, '')), '');

    BEGIN
        INSERT INTO customers (
            name, national_id, phone, address, birth_date, occupation, marital_status, owner_id, is_imported
        ) VALUES (
            btrim(p_customer_name),
            v_national_id,
            NULLIF(btrim(coalesce(p_phone, '')), ''),
            NULLIF(btrim(coalesce(p_address, '')), ''),
            p_birth_date,
            NULLIF(btrim(coalesce(p_occupation, '')), ''),
            NULLIF(btrim(coalesce(p_marital_status, '')), '')::marital_status,
            v_agent_id,
            true
        )
        RETURNING id INTO v_customer_id;
    EXCEPTION
        WHEN unique_violation THEN
            RAISE EXCEPTION 'الرقم القومي مستخدم من قبل لعميل آخر';
        WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'قيمة الحالة الاجتماعية غير صحيحة: %', p_marital_status;
    END;

    BEGIN
        INSERT INTO policies (
            policy_number, customer_id, owner_id, policy_type, start_date,
            payment_method, premium_amount, sum_assured, status, notes, nature
        ) VALUES (
            btrim(p_policy_number),
            v_customer_id,
            v_agent_id,
            p_policy_type::policy_type,
            p_start_date,
            p_payment_method::payment_method,
            p_premium_amount,
            p_sum_assured,
            'active',
            NULLIF(btrim(coalesce(p_notes, '')), ''),
            'existing'
        )
        RETURNING id INTO v_policy_id;
    EXCEPTION
        WHEN unique_violation THEN
            RAISE EXCEPTION 'رقم الوثيقة مستخدم من قبل';
        WHEN invalid_text_representation THEN
            RAISE EXCEPTION 'نوع الوثيقة أو طريقة السداد غير صحيحة';
    END;

    PERFORM generate_installments(v_policy_id, p_start_date, p_payment_method::payment_method, p_premium_amount);

    PERFORM mark_historical_installments_paid(v_policy_id);

    PERFORM log_activity('customer_create', 'customer', v_customer_id);
    PERFORM log_activity('policy_create', 'policy', v_policy_id);

    RETURN jsonb_build_object(
        'customer_id', v_customer_id,
        'policy_id', v_policy_id,
        'agent_id', v_agent_id
    );
END;
$function$;

CREATE OR REPLACE FUNCTION public.regenerate_installments()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.start_date IS DISTINCT FROM NEW.start_date
       OR OLD.payment_method IS DISTINCT FROM NEW.payment_method
       OR OLD.premium_amount IS DISTINCT FROM NEW.premium_amount THEN

        DELETE FROM installments
        WHERE policy_id = NEW.id
        AND status = 'pending';

        PERFORM generate_installments(
            NEW.id, NEW.start_date, NEW.payment_method, NEW.premium_amount
        );

        PERFORM mark_historical_installments_paid(NEW.id);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'policy_auto_cancel';
;
