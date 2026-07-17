/*
# نظام الاشتراكات — الجزء الأول: الهيكل العام وآلية الاشتراك

نظام مستقل برمجياً داخل نفس قاعدة بيانات Supabase الحالية. لا يعدّل أو يحذف
أي جدول أو دالة أو صلاحية موجودة من قبل — كل ما فيه إضافات جديدة فقط.

1. جداول جديدة
   - subscription_durations   : مدد الاشتراك القابلة للتوسع (ربع/نصف/سنوي...)
   - subscription_plan_prices : سعر كل درجة وظيفية × كل مدة
   - subscription_settings    : إعدادات النظام (تجربة، سماح، بيانات الدفع...)
   - subscriptions            : الحالة الحالية لاشتراك كل مستخدم (صف واحد لكل مستخدم)
   - subscription_payments    : طلبات الدفع/التجديد وإيصالاتها ونتيجة الـ OCR
   - subscription_discounts   : قواعد الخصومات
   - promo_codes              : أكواد الخصم المرتبطة بقواعد الخصم
   - subscription_logs        : سجل عمليات مستقل خاص بالاشتراكات

2. الأمان
   - RLS مفعّل على كل الجداول. القراءة العامة للأسعار/المدد/الإعدادات العامة
     (مش بيانات حساسة)، والكتابة لـ super_admin فقط أو عبر دوال محكومة.
   - كل مستخدم يشوف اشتراكه واشتراكات التابعين له فقط (نفس منطق get_user_subtree
     الحالي، من غير أي تعديل عليه).

3. الفترة التجريبية
   - عند إنشاء مستخدم جديد (غير agent/premium_agent) بيتاخد له صف اشتراك تلقائي
     status = 'trial' لمدة subscription_settings.trial_months (افتراضي 6 شهور).
   - super_admin بياخد اشتراك 'active' مجاني بلا تاريخ انتهاء.
   - تم عمل Backfill لكل المستخدمين الحاليين بنفس المنطق (باستخدام created_at
     الحقيقي بتاعهم كبداية للتجربة).

4. ملاحظة مهمة
   - الوكلاء (agent/premium_agent) لا يملكون اشتراكاً مستقلاً؛ يتم تفعيلهم
     تلقائياً ضمن اشتراك رئيس المجموعة التابعين له (بيُطبَّق في الجزء الخاص
     بمنطق التفعيل الهرمي في الأجزاء القادمة).
*/

-- ═══════════════════════════════════════════════════════════
-- 1) Enums
-- ═══════════════════════════════════════════════════════════

DO $$ BEGIN
    CREATE TYPE subscription_status AS ENUM (
        'trial', 'active', 'expired', 'pending_payment', 'suspended'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE subscription_payment_method AS ENUM ('instapay', 'vodafone_cash');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE subscription_payment_request_status AS ENUM (
        'submitted', 'ocr_verified', 'ocr_mismatch', 'approved', 'rejected'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE subscription_discount_type AS ENUM ('percentage', 'fixed');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ═══════════════════════════════════════════════════════════
-- 2) subscription_durations — مدد الاشتراك (قابلة للتوسع مستقبلاً)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS subscription_durations (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    key text UNIQUE NOT NULL,
    label text NOT NULL,
    months int NOT NULL CHECK (months > 0),
    is_active boolean NOT NULL DEFAULT true,
    is_default boolean NOT NULL DEFAULT false,
    sort_order int NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

INSERT INTO subscription_durations (key, label, months, sort_order, is_default) VALUES
    ('quarterly',   'ربع سنوي',  3,  1, true),
    ('semi_annual', 'نصف سنوي',  6,  2, false),
    ('annual',      'سنوي',      12, 3, false)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE subscription_durations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_durations_select_all" ON subscription_durations;
CREATE POLICY "subscription_durations_select_all" ON subscription_durations FOR SELECT
    TO authenticated USING (true);

DROP POLICY IF EXISTS "subscription_durations_write_super_admin" ON subscription_durations;
CREATE POLICY "subscription_durations_write_super_admin" ON subscription_durations FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

-- ═══════════════════════════════════════════════════════════
-- 3) subscription_plan_prices — سعر كل درجة وظيفية × كل مدة
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS subscription_plan_prices (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    role user_role NOT NULL,
    duration_id uuid NOT NULL REFERENCES subscription_durations(id) ON DELETE CASCADE,
    price numeric(10,2) NOT NULL DEFAULT 0,
    is_active boolean NOT NULL DEFAULT true,
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT unique_role_duration UNIQUE (role, duration_id)
);

ALTER TABLE subscription_plan_prices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_prices_select_all" ON subscription_plan_prices;
CREATE POLICY "subscription_prices_select_all" ON subscription_plan_prices FOR SELECT
    TO authenticated USING (true);

DROP POLICY IF EXISTS "subscription_prices_write_super_admin" ON subscription_plan_prices;
CREATE POLICY "subscription_prices_write_super_admin" ON subscription_plan_prices FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

DROP TRIGGER IF EXISTS update_subscription_prices_updated_at ON subscription_plan_prices;
CREATE TRIGGER update_subscription_prices_updated_at
    BEFORE UPDATE ON subscription_plan_prices
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO subscription_plan_prices (role, duration_id, price)
SELECT r.role, d.id, r.price
FROM (VALUES
    ('group_leader'::user_role,        'quarterly',   750),
    ('group_leader'::user_role,        'semi_annual', 1450),
    ('group_leader'::user_role,        'annual',      2800),
    ('supervisor'::user_role,          'quarterly',   500),
    ('supervisor'::user_role,          'semi_annual', 950),
    ('supervisor'::user_role,          'annual',      1800),
    ('general_supervisor'::user_role,  'quarterly',   750),
    ('general_supervisor'::user_role,  'semi_annual', 1450),
    ('general_supervisor'::user_role,  'annual',      2800),
    ('development_manager'::user_role, 'quarterly',   1000),
    ('development_manager'::user_role, 'semi_annual', 1900),
    ('development_manager'::user_role, 'annual',      3600)
) AS r(role, duration_key, price)
JOIN subscription_durations d ON d.key = r.duration_key
ON CONFLICT (role, duration_id) DO NOTHING;

-- ═══════════════════════════════════════════════════════════
-- 4) subscription_settings — صف واحد بإعدادات النظام العامة
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS subscription_settings (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    subscriptions_enabled boolean NOT NULL DEFAULT true,
    trial_enabled boolean NOT NULL DEFAULT true,
    trial_months int NOT NULL DEFAULT 6,
    grace_period_days int NOT NULL DEFAULT 0,
    default_duration_id uuid REFERENCES subscription_durations(id),
    instapay_enabled boolean NOT NULL DEFAULT true,
    instapay_name text,
    instapay_number text,
    vodafone_cash_enabled boolean NOT NULL DEFAULT true,
    vodafone_cash_name text,
    vodafone_cash_number text,
    qr_code_url text,
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now(),
    CONSTRAINT single_row_table CHECK (id IS NOT NULL)
);

ALTER TABLE subscription_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_settings_select_all" ON subscription_settings;
CREATE POLICY "subscription_settings_select_all" ON subscription_settings FOR SELECT
    TO authenticated USING (true);

DROP POLICY IF EXISTS "subscription_settings_write_super_admin" ON subscription_settings;
CREATE POLICY "subscription_settings_write_super_admin" ON subscription_settings FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

DROP TRIGGER IF EXISTS update_subscription_settings_updated_at ON subscription_settings;
CREATE TRIGGER update_subscription_settings_updated_at
    BEFORE UPDATE ON subscription_settings
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

INSERT INTO subscription_settings (id, default_duration_id)
SELECT gen_random_uuid(), id FROM subscription_durations WHERE key = 'quarterly'
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════
-- 5) subscriptions — الحالة الحالية لاشتراك كل مستخدم (صف واحد لكل مستخدم)
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS subscriptions (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id uuid NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
    status subscription_status NOT NULL DEFAULT 'trial',
    is_trial_used boolean NOT NULL DEFAULT false,
    trial_start_date date,
    trial_end_date date,
    duration_id uuid REFERENCES subscription_durations(id),
    current_period_start date,
    current_period_end date,
    activated_by uuid REFERENCES users(id),
    created_at timestamptz DEFAULT now(),
    updated_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscriptions_select_own_and_below" ON subscriptions;
CREATE POLICY "subscriptions_select_own_and_below" ON subscriptions FOR SELECT
    TO authenticated
    USING (user_id IN (SELECT unnest(get_user_subtree(auth.uid()))));

DROP POLICY IF EXISTS "subscriptions_write_super_admin" ON subscriptions;
CREATE POLICY "subscriptions_write_super_admin" ON subscriptions FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
CREATE TRIGGER update_subscriptions_updated_at
    BEFORE UPDATE ON subscriptions
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ═══════════════════════════════════════════════════════════
-- 6) subscription_payments — طلبات الدفع/التجديد وإيصالاتها
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS subscription_payments (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    payer_user_id uuid NOT NULL REFERENCES users(id),
    included_user_ids uuid[] NOT NULL DEFAULT '{}',
    duration_id uuid NOT NULL REFERENCES subscription_durations(id),
    payment_method subscription_payment_method NOT NULL,
    amount_original numeric(10,2) NOT NULL DEFAULT 0,
    discount_id uuid,
    promo_code_id uuid,
    amount_final numeric(10,2) NOT NULL DEFAULT 0,
    receipt_url text NOT NULL,
    reference_number text,
    ocr_extracted jsonb,
    ocr_match_status text,
    ocr_mismatch_reasons text[],
    status subscription_payment_request_status NOT NULL DEFAULT 'submitted',
    rejection_reason text,
    reviewed_by uuid REFERENCES users(id),
    reviewed_at timestamptz,
    created_at timestamptz DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uniq_subscription_payment_reference
    ON subscription_payments (payment_method, reference_number)
    WHERE reference_number IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_subscription_payments_payer ON subscription_payments(payer_user_id);
CREATE INDEX IF NOT EXISTS idx_subscription_payments_status ON subscription_payments(status);

ALTER TABLE subscription_payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_payments_select_own_or_admin" ON subscription_payments;
CREATE POLICY "subscription_payments_select_own_or_admin" ON subscription_payments FOR SELECT
    TO authenticated
    USING (
        payer_user_id = auth.uid()
        OR EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
    );

DROP POLICY IF EXISTS "subscription_payments_insert_own" ON subscription_payments;
CREATE POLICY "subscription_payments_insert_own" ON subscription_payments FOR INSERT
    TO authenticated
    WITH CHECK (payer_user_id = auth.uid());

DROP POLICY IF EXISTS "subscription_payments_update_super_admin" ON subscription_payments;
CREATE POLICY "subscription_payments_update_super_admin" ON subscription_payments FOR UPDATE
    TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "subscription_payments_delete_super_admin" ON subscription_payments;
CREATE POLICY "subscription_payments_delete_super_admin" ON subscription_payments FOR DELETE
    TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

-- ═══════════════════════════════════════════════════════════
-- 7) subscription_discounts + promo_codes
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS subscription_discounts (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name text NOT NULL,
    type subscription_discount_type NOT NULL,
    value numeric(10,2) NOT NULL,
    starts_at date,
    ends_at date,
    usage_limit int,
    usage_count int NOT NULL DEFAULT 0,
    target_roles user_role[],
    target_duration_ids uuid[],
    target_user_ids uuid[],
    is_active boolean NOT NULL DEFAULT true,
    created_by uuid REFERENCES users(id),
    created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS promo_codes (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    code text UNIQUE NOT NULL,
    discount_id uuid NOT NULL REFERENCES subscription_discounts(id) ON DELETE CASCADE,
    is_active boolean NOT NULL DEFAULT true,
    usage_limit int,
    usage_count int NOT NULL DEFAULT 0,
    created_at timestamptz DEFAULT now()
);

ALTER TABLE subscription_discounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE promo_codes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_discounts_super_admin" ON subscription_discounts;
CREATE POLICY "subscription_discounts_super_admin" ON subscription_discounts FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

DROP POLICY IF EXISTS "promo_codes_super_admin" ON promo_codes;
CREATE POLICY "promo_codes_super_admin" ON promo_codes FOR ALL
    TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

-- ═══════════════════════════════════════════════════════════
-- 8) subscription_logs — سجل عمليات مستقل خاص بالاشتراكات
-- ═══════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS subscription_logs (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id uuid REFERENCES users(id),
    action text NOT NULL,
    target_user_id uuid REFERENCES users(id),
    payment_id uuid REFERENCES subscription_payments(id),
    notes text,
    created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_logs_created_at ON subscription_logs(created_at DESC);

ALTER TABLE subscription_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "subscription_logs_select_super_admin" ON subscription_logs;
CREATE POLICY "subscription_logs_select_super_admin" ON subscription_logs FOR SELECT
    TO authenticated
    USING (EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'));

CREATE OR REPLACE FUNCTION log_subscription_action(
    p_action text,
    p_target_user_id uuid DEFAULT NULL,
    p_payment_id uuid DEFAULT NULL,
    p_notes text DEFAULT NULL
) RETURNS void AS $$
BEGIN
    INSERT INTO subscription_logs (actor_user_id, action, target_user_id, payment_id, notes)
    VALUES (auth.uid(), p_action, p_target_user_id, p_payment_id, p_notes);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION log_subscription_action(text, uuid, uuid, text) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- 9) الفترة التجريبية التلقائية لكل مستخدم جديد
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION assign_initial_subscription()
RETURNS TRIGGER AS $$
DECLARE
    v_trial_months int;
BEGIN
    IF NEW.role IN ('agent', 'premium_agent') THEN
        RETURN NEW;
    END IF;

    IF NEW.role = 'super_admin' THEN
        INSERT INTO subscriptions (user_id, status, is_trial_used)
        VALUES (NEW.id, 'active', false)
        ON CONFLICT (user_id) DO NOTHING;
        RETURN NEW;
    END IF;

    SELECT COALESCE(trial_months, 6) INTO v_trial_months FROM subscription_settings LIMIT 1;

    INSERT INTO subscriptions (user_id, status, is_trial_used, trial_start_date, trial_end_date)
    VALUES (
        NEW.id, 'trial', true,
        NEW.created_at::date,
        (NEW.created_at::date + (COALESCE(v_trial_months, 6) || ' months')::interval)::date
    )
    ON CONFLICT (user_id) DO NOTHING;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_assign_initial_subscription ON users;
CREATE TRIGGER trg_assign_initial_subscription
    AFTER INSERT ON users
    FOR EACH ROW EXECUTE FUNCTION assign_initial_subscription();

DO $$
DECLARE
    v_trial_months int;
    r RECORD;
BEGIN
    SELECT COALESCE(trial_months, 6) INTO v_trial_months FROM subscription_settings LIMIT 1;

    FOR r IN SELECT id, role, created_at FROM users WHERE role NOT IN ('agent', 'premium_agent') LOOP
        IF r.role = 'super_admin' THEN
            INSERT INTO subscriptions (user_id, status, is_trial_used)
            VALUES (r.id, 'active', false)
            ON CONFLICT (user_id) DO NOTHING;
        ELSE
            INSERT INTO subscriptions (user_id, status, is_trial_used, trial_start_date, trial_end_date)
            VALUES (
                r.id, 'trial', true,
                r.created_at::date,
                (r.created_at::date + (COALESCE(v_trial_months, 6) || ' months')::interval)::date
            )
            ON CONFLICT (user_id) DO NOTHING;
        END IF;
    END LOOP;
END $$;

-- ═══════════════════════════════════════════════════════════
-- 10) دالة الهيكل الهرمي القابل للدفع عنه
-- ═══════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_payable_subordinates(p_payer_id uuid)
RETURNS TABLE(
    user_id uuid, name text, role user_role, manager_id uuid,
    is_active boolean, subscription_status subscription_status,
    current_period_end date, is_trial_used boolean
) AS $$
BEGIN
    IF p_payer_id <> auth.uid() AND NOT EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin'
    ) THEN
        RAISE EXCEPTION 'غير مصرح';
    END IF;

    RETURN QUERY
    SELECT u.id, u.name, u.role, u.manager_id, u.is_active,
           s.status, s.current_period_end, s.is_trial_used
    FROM users u
    JOIN subscriptions s ON s.user_id = u.id
    WHERE u.id = ANY (get_user_subtree(p_payer_id))
      AND u.id <> p_payer_id
      AND u.role IN ('development_manager', 'general_supervisor', 'supervisor', 'group_leader');
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_payable_subordinates(uuid) TO authenticated;

-- ═══════════════════════════════════════════════════════════
-- 11) إضافة أنواع إشعارات الاشتراكات لجدول الإشعارات الحالي
-- ═══════════════════════════════════════════════════════════

ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'subscription_approved';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'subscription_rejected';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'subscription_expiring_soon';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'subscription_expired';
