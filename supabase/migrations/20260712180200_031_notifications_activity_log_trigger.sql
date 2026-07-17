-- ================================================================
-- تفعيل الإشعارات تلقائياً من كل عملية تُسجَّل في activity_logs
-- (نفس نقطة التسجيل التي يستخدمها التطبيق بالفعل عبر log_activity/الـ Edge Functions)
-- لا تغيير في أي منطق عمل قائم - فقط توليد إشعار مرتبط بنفس الحدث المسجَّل.
-- ================================================================

CREATE OR REPLACE FUNCTION public.notify_from_activity_log()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_subject_id   uuid;
    v_recipients   uuid[];
    v_title        text;
    v_message      text;
    v_notif_type   notification_type;
    v_target_name  text;
    v_actor_name   text;
    v_customer_name text;
    v_policy_number text;
    v_owner_id     uuid;
    v_is_broadcast boolean := false;
BEGIN
    SELECT name INTO v_actor_name FROM users WHERE id = NEW.user_id;

    -- ── أحداث المستخدمين ──────────────────────────────────────────
    IF NEW.action_type = 'user_create' THEN
        SELECT name INTO v_target_name FROM users WHERE id = NEW.entity_id;
        v_subject_id := NEW.entity_id;
        v_notif_type := 'user_created';
        v_title      := 'مستخدم جديد';
        v_message    := 'تمت إضافة المستخدم ' || COALESCE(v_target_name, '') || ' بواسطة ' || COALESCE(v_actor_name, 'النظام');

    ELSIF NEW.action_type IN ('user_update', 'role_update', 'target_update') THEN
        SELECT name INTO v_target_name FROM users WHERE id = NEW.entity_id;
        v_subject_id := NEW.entity_id;
        v_notif_type := 'user_updated';
        v_title      := 'تعديل بيانات مستخدم';
        v_message    := 'تم تعديل بيانات المستخدم ' || COALESCE(v_target_name, '') || ' بواسطة ' || COALESCE(v_actor_name, 'النظام');

    ELSIF NEW.action_type = 'user_disable' THEN
        SELECT name INTO v_target_name FROM users WHERE id = NEW.entity_id;
        v_subject_id := NEW.entity_id;
        v_notif_type := 'user_disabled';
        v_title      := 'تعطيل مستخدم';
        v_message    := 'تم تعطيل المستخدم ' || COALESCE(v_target_name, '') || ' بواسطة ' || COALESCE(v_actor_name, 'النظام');

    ELSIF NEW.action_type = 'user_enable' THEN
        SELECT name INTO v_target_name FROM users WHERE id = NEW.entity_id;
        v_subject_id := NEW.entity_id;
        v_notif_type := 'user_enabled';
        v_title      := 'إعادة تنشيط مستخدم';
        v_message    := 'تم إعادة تنشيط المستخدم ' || COALESCE(v_target_name, '') || ' بواسطة ' || COALESCE(v_actor_name, 'النظام');

    ELSIF NEW.action_type = 'user_delete' THEN
        v_target_name := COALESCE(NEW.old_values->>'name', '');
        v_subject_id  := NEW.entity_id;
        v_notif_type  := 'user_deleted';
        v_title       := 'حذف مستخدم';
        v_message     := 'تم حذف المستخدم ' || v_target_name || ' بواسطة ' || COALESCE(v_actor_name, 'النظام');

    -- ── العملاء ────────────────────────────────────────────────────
    ELSIF NEW.action_type = 'customer_create' THEN
        SELECT name, owner_id INTO v_customer_name, v_owner_id FROM customers WHERE id = NEW.entity_id;
        v_subject_id := COALESCE(v_owner_id, NEW.user_id);
        v_notif_type := 'customer_created';
        v_title      := 'عميل جديد';
        v_message    := 'تمت إضافة العميل ' || COALESCE(v_customer_name, '') || ' بواسطة ' || COALESCE(v_actor_name, 'النظام');

    -- ── الوثائق ────────────────────────────────────────────────────
    ELSIF NEW.action_type = 'policy_create' THEN
        SELECT p.policy_number, p.owner_id, c.name INTO v_policy_number, v_owner_id, v_customer_name
        FROM policies p JOIN customers c ON c.id = p.customer_id WHERE p.id = NEW.entity_id;
        v_subject_id := COALESCE(v_owner_id, NEW.user_id);
        v_notif_type := 'policy_created';
        v_title      := 'وثيقة جديدة';
        v_message    := 'تم إصدار الوثيقة رقم ' || COALESCE(v_policy_number, '') || ' للعميل ' || COALESCE(v_customer_name, '');

    ELSIF NEW.action_type = 'policy_cancel' THEN
        SELECT p.policy_number, p.owner_id, c.name INTO v_policy_number, v_owner_id, v_customer_name
        FROM policies p JOIN customers c ON c.id = p.customer_id WHERE p.id = NEW.entity_id;
        v_subject_id := COALESCE(v_owner_id, NEW.user_id);
        v_notif_type := 'policy_cancelled';
        v_title      := 'إلغاء وثيقة';
        v_message    := 'تم إلغاء الوثيقة رقم ' || COALESCE(v_policy_number, '') || ' للعميل ' || COALESCE(v_customer_name, '');

    -- ── السداد ─────────────────────────────────────────────────────
    ELSIF NEW.action_type = 'payment_create' THEN
        SELECT p.policy_number, p.owner_id, c.name INTO v_policy_number, v_owner_id, v_customer_name
        FROM installments i JOIN policies p ON p.id = i.policy_id JOIN customers c ON c.id = p.customer_id
        WHERE i.id = NEW.entity_id;
        v_subject_id := COALESCE(v_owner_id, NEW.user_id);
        v_notif_type := 'payment_received';
        v_title      := 'تم سداد قسط';
        v_message    := 'تم سداد قسط الوصل رقم ' || COALESCE(v_policy_number, '') || ' للعميل ' || COALESCE(v_customer_name, '');

    ELSIF NEW.action_type = 'payment_cancel' THEN
        SELECT p.policy_number, p.owner_id, c.name INTO v_policy_number, v_owner_id, v_customer_name
        FROM installments i JOIN policies p ON p.id = i.policy_id JOIN customers c ON c.id = p.customer_id
        WHERE i.id = NEW.entity_id;
        v_subject_id := COALESCE(v_owner_id, NEW.user_id);
        v_notif_type := 'payment_cancelled';
        v_title      := 'تم إلغاء سداد';
        v_message    := 'تم إلغاء سداد قسط الوصل رقم ' || COALESCE(v_policy_number, '') || ' للعميل ' || COALESCE(v_customer_name, '');

    -- ── تقفيل الشهر (بث لكل من له صلاحية تقفيل الشهر: مراقب فأعلى) ──
    ELSIF NEW.action_type = 'month_close' THEN
        v_is_broadcast := true;
        v_notif_type   := 'month_closing_completed';
        v_title        := 'اكتمل تقفيل الشهر';
        v_message      := 'تم تقفيل الشهر بواسطة ' || COALESCE(v_actor_name, 'النظام');

    ELSE
        RETURN NEW; -- حدث لا يستدعي إشعاراً
    END IF;

    IF v_is_broadcast THEN
        SELECT array_agg(id) INTO v_recipients FROM users
        WHERE role IN ('supervisor', 'general_supervisor', 'development_manager', 'super_admin')
        AND deleted_at IS NULL;
    ELSIF v_subject_id IS NOT NULL THEN
        v_recipients := get_user_ancestors(v_subject_id);
    ELSE
        RETURN NEW;
    END IF;

    PERFORM notify_users(v_recipients, v_notif_type, v_title, v_message, NEW.entity_type, NEW.entity_id);

    RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_from_activity_log() FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_from_activity_log() FROM authenticated;

DROP TRIGGER IF EXISTS trg_notify_from_activity_log ON activity_logs;
CREATE TRIGGER trg_notify_from_activity_log
    AFTER INSERT ON activity_logs
    FOR EACH ROW
    EXECUTE FUNCTION notify_from_activity_log();
