-- ============================================================
-- 1) دالة مساعدة جديدة: is_super_admin()
--    تُستخدم بدلاً من check_is_admin() في سياسات جدول users
--    فقط للتحقق من كون المستخدم Super Admin (وليس مدير تطوير)
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_super_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.users
    WHERE id = auth.uid() AND role = 'super_admin'
  );
END;
$function$;

-- ============================================================
-- 2) جدول users: استبدال check_is_admin() بـ is_super_admin()
--    + إضافة نطاق الهيكل الإداري (subtree) لمدير التطوير
--    في INSERT / UPDATE / DELETE (لم يكن مقيّداً بالهيكل سابقاً)
-- ============================================================

-- SELECT: Super Admin يرى الكل، غيره يرى نفسه ومن تحته فقط
ALTER POLICY users_admin_select_all ON public.users
USING (
  is_super_admin()
  OR (id IN (SELECT unnest(get_user_subtree(auth.uid()))))
);

-- INSERT: المستخدم الجديد يجب أن يكون مديره ضمن نطاق المُنشئ (أو Super Admin)
ALTER POLICY users_admin_insert ON public.users
WITH CHECK (
  is_super_admin()
  OR (manager_id IN (SELECT unnest(get_user_subtree(auth.uid()))))
);

-- UPDATE: تعديل الذات أو من هم أسفل في الهيكل فقط (أو Super Admin)
ALTER POLICY users_admin_update ON public.users
USING (
  is_super_admin()
  OR (id IN (SELECT unnest(get_user_subtree(auth.uid()))))
)
WITH CHECK (
  is_super_admin()
  OR (id IN (SELECT unnest(get_user_subtree(auth.uid()))))
);

-- DELETE: حذف من هم أسفل في الهيكل فقط (أو Super Admin)
ALTER POLICY users_admin_delete ON public.users
USING (
  is_super_admin()
  OR (id IN (SELECT unnest(get_user_subtree(auth.uid()))))
);

-- ============================================================
-- 3) جدول payments: سياسة payments_update_cancel كانت تمنح
--    مدير التطوير صلاحية على كل الدفعات في النظام بلا استثناء.
--    تم تقييد مدير التطوير فقط بنطاق هيكله الإداري.
--    (سلوك general_supervisor و supervisor لم يتغيّر إطلاقاً)
-- ============================================================
ALTER POLICY payments_update_cancel ON public.payments
USING (
  (paid_by_user_id = auth.uid())
  OR (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin'))
  OR (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('general_supervisor', 'supervisor')))
  OR (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'development_manager')
    AND installment_id IN (
      SELECT i.id FROM installments i
      JOIN policies p ON i.policy_id = p.id
      WHERE p.owner_id IN (SELECT unnest(get_user_subtree(auth.uid())))
    )
  )
)
WITH CHECK (
  (paid_by_user_id = auth.uid())
  OR (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'super_admin'))
  OR (EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role IN ('general_supervisor', 'supervisor')))
  OR (
    EXISTS (SELECT 1 FROM users WHERE users.id = auth.uid() AND users.role = 'development_manager')
    AND installment_id IN (
      SELECT i.id FROM installments i
      JOIN policies p ON i.policy_id = p.id
      WHERE p.owner_id IN (SELECT unnest(get_user_subtree(auth.uid())))
    )
  )
);

-- ============================================================
-- 4) get_dashboard_stats: كانت تثق بـ p_user_id المُرسَل من العميل
--    بدون أي تحقق (SECURITY DEFINER يتخطى RLS بالكامل).
--    الآن: لا يمكن الاستعلام إلا عن نفسه أو عن مستخدم ضمن نطاقه.
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
            AND start_date >= v_month_start
            AND start_date <= v_month_end
        ),
        'new_customers_this_month', (
            SELECT COUNT(*)
            FROM customers
            WHERE owner_id = ANY(v_subtree)
            AND created_at >= v_month_start
            AND created_at < v_month_start + interval '1 month'
        )
    ) INTO v_result;

    RETURN v_result;
END;
$function$;

-- ============================================================
-- 5) get_collection_report: نفس ثغرة الثقة بـ p_user_id
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_collection_report(p_start_date date, p_end_date date, p_user_id uuid DEFAULT NULL::uuid)
RETURNS TABLE(agent_id uuid, agent_name text, collected_amount numeric, payments_count bigint, new_production numeric)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_user_id uuid;
    v_subtree uuid[];
BEGIN
    v_user_id := COALESCE(p_user_id, auth.uid());

    IF v_user_id <> auth.uid()
       AND NOT is_super_admin()
       AND v_user_id <> ALL (get_user_subtree(auth.uid()))
    THEN
        RAISE EXCEPTION 'ليس لديك صلاحية لعرض تقرير هذا المستخدم';
    END IF;

    v_subtree := get_user_subtree(v_user_id);

    RETURN QUERY
    SELECT
        u.id as agent_id,
        u.name as agent_name,
        COALESCE(SUM(CASE WHEN pay.is_cancelled = false THEN pay.amount ELSE 0 END), 0) as collected_amount,
        COUNT(CASE WHEN pay.is_cancelled = false THEN 1 END) as payments_count,
        COALESCE(SUM(CASE WHEN i.is_first = true AND pay.is_cancelled = false THEN pay.amount ELSE 0 END), 0) as new_production
    FROM users u
    LEFT JOIN policies p ON p.owner_id = u.id
    LEFT JOIN installments i ON i.policy_id = p.id
    LEFT JOIN payments pay ON pay.installment_id = i.id
        AND pay.payment_month >= p_start_date
        AND pay.payment_month <= p_end_date
    WHERE u.id = ANY(v_subtree)
    AND u.role IN ('agent', 'premium_agent')
    GROUP BY u.id, u.name
    ORDER BY collected_amount DESC;
END;
$function$;

-- ============================================================
-- 6) get_target_progress: نفس ثغرة الثقة بـ p_user_id
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
    AND i.paid_at >= v_month
    AND i.paid_at < v_month + interval '1 month';

    RETURN jsonb_build_object(
        'target', COALESCE(v_target, 0),
        'achieved', v_achieved,
        'percentage', CASE WHEN COALESCE(v_target, 0) > 0 THEN ROUND((v_achieved / v_target * 100)::numeric, 1) ELSE 0 END
    );
END;
$function$;

-- ============================================================
-- 7) transfer_user: كانت تسمح لأي development_manager بنقل
--    أي مستخدم في النظام (حتى خارج نطاقه) إلى أي مدير آخر.
--    الآن: مدير التطوير يمكنه فقط نقل مستخدمين ضمن نطاقه،
--    وإلى مدير جديد ضمن نطاقه أيضاً. Super Admin بلا قيود.
-- ============================================================
CREATE OR REPLACE FUNCTION public.transfer_user(p_user_id uuid, p_new_manager_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_old_manager_id uuid;
    v_caller_subtree uuid[];
BEGIN
    IF is_super_admin() THEN
        NULL; -- بلا قيود
    ELSIF EXISTS (
        SELECT 1 FROM users WHERE id = auth.uid() AND role = 'development_manager'
    ) THEN
        v_caller_subtree := get_user_subtree(auth.uid());
        IF p_user_id <> ALL (v_caller_subtree) OR p_new_manager_id <> ALL (v_caller_subtree) THEN
            RAISE EXCEPTION 'لا يمكنك نقل مستخدم أو تعيين مدير خارج نطاقك الإداري';
        END IF;
    ELSE
        RAISE EXCEPTION 'Unauthorized';
    END IF;

    SELECT manager_id INTO v_old_manager_id FROM users WHERE id = p_user_id;

    UPDATE users SET manager_id = p_new_manager_id, updated_at = now()
    WHERE id = p_user_id;

    PERFORM log_activity(
        'user_transfer'::action_type,
        'user',
        p_user_id,
        jsonb_build_object('manager_id', v_old_manager_id),
        jsonb_build_object('manager_id', p_new_manager_id)
    );
END;
$function$;
;
