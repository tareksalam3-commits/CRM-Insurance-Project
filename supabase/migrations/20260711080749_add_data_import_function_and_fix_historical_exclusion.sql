/*
صفحة "استيراد البيانات" — إعداد قاعدة البيانات الكامل

هذا الملف يضيف:
1) عمود customers.is_imported (مواز تمامًا لعمود policies.nature الموجود
   بالفعل من قبل، والذي له بالفعل القيمة 'existing' غير مستخدمة حاليًا في
   أي مكان). كلاهما علامة على أن السجل جاء من الاستيراد ويمثل عميل/وثيقة
   قائمة بالفعل، وليس عميل/عمولة "جديدة" لهذا الشهر.
2) دالة import_policy_row: صف واحد = عميل + وثيقة + أقساط، Transaction
   واحدة كاملة (SECURITY DEFINER)، تُستخدم فقط من صفحة استيراد البيانات
   الجديدة في الواجهة.
3) تعديل جراحي بسطر واحد فقط في كل من get_dashboard_stats و
   get_target_progress (الدالتان الوحيدتان في القيم الحالية بقاعدة
   البيانات اللي بيحسبوا "إنتاج جديد/تارجت محقق" اعتمادًا على
   installments.is_first + paid_at، بدون أي فلترة حاليًا) — بدون المساس
   بأي جزء آخر من أي دالة. باقي كل دالة منسوخ حرفيًا زي ما هو موجود الآن.

لماذا التعديل على هاتين الدالتين تحديدًا ضروري ولا يمكن تفاديه؟
راجعت التعريف الفعلي الحالي لـ get_dashboard_stats و get_target_progress
في قاعدة البيانات، ووجدت أنهما يحسبان "الإنتاج الجديد/التارجت المحقق"
بالاعتماد على installments.is_first = true AND status = 'paid' AND
paid_at ضمن نطاق الشهر المطلوب — من غير أي شرط استبعاد. بما أن أقساط
الاستيراد التاريخية بتتحدد status='paid' و paid_at = تاريخ استحقاقها
الأصلي (وهو غالبًا في الماضي)، فهي كانت هتظهر تلقائيًا في تارجت/إنتاج
أي شهر ماضي يقابل تاريخ استحقاقها الأصلي دون أي إصلاح. عمود
installments.is_historical كان بالفعل مُجهّز من قبل بالضبط لهذا الغرض
(من migration قديمة add_existing_policies_support) لكنه لم يكن مُستخدَم
فعليًا في أي دالة حتى الآن. فقط أكملت استخدامه في هاتين الدالتين + في
generate_installments (عن طريق تحديثه يدويًا بعد التوليد داخل دالة
الاستيراد، لأن generate_installments الحالية لا تحدد قيمته بنفسها).

نفس المنطق لعمود policies.nature = 'existing' مع new_policies_this_month،
وعمود customers.is_imported الجديد مع new_customers_this_month، عشان
عدد "العملاء/الوثائق الجدد هذا الشهر" ميتأثرش بعملية استيراد بيانات
قديمة أبدًا.

كل التعديلات هنا إضافية بحتة (أعمدة جديدة + شرط استبعاد واحد إضافي في كل
استعلام) ولا تُغيّر أي سلوك حالي لأي بيانات غير مستوردة (is_historical
و is_imported كلاهما NOT NULL DEFAULT false، فأي صف قديم أو مُدخَل يدويًا
لا يتأثر إطلاقًا).
*/

-- ============================================================
-- 1) عمود جديد على customers لتمييز العملاء المستوردين
-- ============================================================
ALTER TABLE customers ADD COLUMN IF NOT EXISTS is_imported boolean NOT NULL DEFAULT false;
COMMENT ON COLUMN customers.is_imported IS 'true إذا كان العميل تم إنشاؤه عبر صفحة استيراد البيانات (استيراد وثيقة قائمة بالفعل)، عشان يُستبعد من مقاييس "عملاء جدد هذا الشهر" في Dashboard.';

COMMENT ON COLUMN policies.nature IS 'new = وثيقة أُنشئت من داخل النظام بشكل طبيعي. existing = وثيقة مستوردة تعتبر قائمة بالفعل (لا تدخل في مقاييس الإنتاج الجديد/التارجت الخاصة بأقساطها التاريخية).';
COMMENT ON COLUMN installments.is_historical IS 'true للأقساط المستوردة التي كان تاريخ استحقاقها قبل تاريخ الاستيراد (مسددة تلقائيًا بتاريخها الأصلي، ومُستبعدة من التارجت وDashboard الإنتاج الجديد).';

-- ============================================================
-- 2) دالة الاستيراد
-- ============================================================
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
    v_import_date   date := CURRENT_DATE;
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

    -- الأقساط اللي قبل تاريخ الاستيراد = مسددة تلقائياً بتاريخ استحقاقها الأصلي،
    -- ومُعلَّمة is_historical عشان تُستبعد من Dashboard/التارجت (بدون إنشاء صف payments)
    UPDATE installments
    SET status = 'paid', paid_at = due_date::timestamptz, is_historical = true, updated_at = now()
    WHERE policy_id = v_policy_id AND due_date < v_import_date;

    PERFORM log_activity('customer_create', 'customer', v_customer_id);
    PERFORM log_activity('policy_create', 'policy', v_policy_id);

    RETURN jsonb_build_object(
        'customer_id', v_customer_id,
        'policy_id', v_policy_id,
        'agent_id', v_agent_id
    );
END;
$function$;

COMMENT ON FUNCTION public.import_policy_row(
    text, text, text, text, date, text, text, text, text, text, numeric, numeric, text, date, text
) IS 'تُستخدم فقط من صفحة "استيراد البيانات". صف واحد = عميل + وثيقة + أقساط السنة الأولى، Transaction واحدة كاملة (SECURITY DEFINER لتفويض owner_id لوكيل آخر ضمن فريق المستورِد فقط، مع تحقق داخلي من get_user_subtree).';

-- ============================================================
-- 3) get_dashboard_stats: استبعاد المستورَد من 3 مقاييس "هذا الشهر" فقط
--    (باقي الدالة منسوخ حرفيًا زي ما هو، بدون أي تغيير آخر)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_dashboard_stats(p_user_id uuid DEFAULT NULL::uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid;
    v_subtree uuid[];
    v_month_start date;
    v_month_end date;
    v_result jsonb;
BEGIN
    v_user_id := COALESCE(p_user_id, auth.uid());

    IF v_user_id <> auth.uid()
       AND NOT is_super_admin()
       AND v_user_id <> ALL (get_user_subtree(auth.uid()))
    THEN
        RAISE EXCEPTION 'ليس لديك صلاحية لعرض بيانات هذا المستخدم';
    END IF;

    v_subtree := get_user_subtree(v_user_id);
    v_month_start := date_trunc('month', CURRENT_DATE)::date;
    v_month_end := (date_trunc('month', CURRENT_DATE) + interval '1 month - 1 day')::date;

    SELECT jsonb_build_object(
        'total_customers', (
            SELECT COUNT(*) FROM customers WHERE owner_id = ANY(v_subtree)
        ),
        'active_policies', (
            SELECT COUNT(*) FROM policies WHERE owner_id = ANY(v_subtree) AND status = 'active'
        ),
        'suspended_policies', (
            SELECT COUNT(*) FROM policies WHERE owner_id = ANY(v_subtree) AND status = 'suspended'
        ),
        'cancelled_policies', (
            SELECT COUNT(*) FROM policies WHERE owner_id = ANY(v_subtree) AND status = 'cancelled'
        ),
        'new_production_this_month', (
            SELECT COALESCE(SUM(i.amount), 0)
            FROM installments i
            JOIN policies p ON i.policy_id = p.id
            WHERE p.owner_id = ANY(v_subtree)
            AND i.is_first = true
            AND i.status = 'paid'
            AND i.is_historical = false
            AND i.paid_at >= v_month_start
            AND i.paid_at < v_month_start + interval '1 month'
        ),
        'collection_this_month', (
            SELECT COALESCE(SUM(pay.amount), 0)
            FROM payments pay
            JOIN installments i ON pay.installment_id = i.id
            JOIN policies p ON i.policy_id = p.id
            WHERE p.owner_id = ANY(v_subtree)
            AND pay.is_cancelled = false
            AND pay.payment_month = v_month_start
        ),
        'pending_installments_count', (
            SELECT COUNT(*)
            FROM installments i
            JOIN policies p ON i.policy_id = p.id
            WHERE p.owner_id = ANY(v_subtree)
            AND i.status IN ('pending', 'overdue')
            AND i.due_date <= CURRENT_DATE
        ),
        'due_this_week', (
            SELECT COUNT(*)
            FROM installments i
            JOIN policies p ON i.policy_id = p.id
            WHERE p.owner_id = ANY(v_subtree)
            AND i.status = 'pending'
            AND i.due_date BETWEEN CURRENT_DATE AND CURRENT_DATE + interval '7 days'
        ),
        'new_policies_this_month', (
            SELECT COUNT(*)
            FROM policies
            WHERE owner_id = ANY(v_subtree)
            AND nature = 'new'
            AND start_date >= v_month_start
            AND start_date <= v_month_end
        ),
        'new_customers_this_month', (
            SELECT COUNT(*)
            FROM customers
            WHERE owner_id = ANY(v_subtree)
            AND is_imported = false
            AND created_at >= v_month_start
            AND created_at < v_month_start + interval '1 month'
        )
    ) INTO v_result;

    RETURN v_result;
END;
$function$;

-- ============================================================
-- 4) get_target_progress: نفس الاستبعاد على "المحقق" لأي شهر
--    (باقي الدالة منسوخ حرفيًا زي ما هو، بدون أي تغيير آخر)
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_target_progress(p_user_id uuid DEFAULT NULL::uuid, p_month date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid;
    v_month date;
    v_target decimal;
    v_achieved decimal;
    v_result jsonb;
BEGIN
    v_user_id := COALESCE(p_user_id, auth.uid());

    IF v_user_id <> auth.uid()
       AND NOT is_super_admin()
       AND v_user_id <> ALL (get_user_subtree(auth.uid()))
    THEN
        RAISE EXCEPTION 'ليس لديك صلاحية لعرض بيانات هذا المستخدم';
    END IF;

    v_month := COALESCE(p_month, date_trunc('month', CURRENT_DATE)::date);

    SELECT target INTO v_target FROM users WHERE id = v_user_id;

    SELECT COALESCE(SUM(i.amount), 0) INTO v_achieved
    FROM installments i
    JOIN policies p ON i.policy_id = p.id
    WHERE p.owner_id = v_user_id
    AND i.is_first = true
    AND i.status = 'paid'
    AND i.is_historical = false
    AND i.paid_at >= v_month
    AND i.paid_at < v_month + interval '1 month';

    RETURN jsonb_build_object(
        'target', COALESCE(v_target, 0),
        'achieved', v_achieved,
        'percentage', CASE WHEN COALESCE(v_target, 0) > 0 THEN ROUND((v_achieved / v_target * 100)::numeric, 1) ELSE 0 END
    );
END;
$function$;
;
