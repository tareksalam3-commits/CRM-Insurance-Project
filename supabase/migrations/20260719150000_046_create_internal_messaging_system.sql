-- ============================================================================
-- 046: نظام "الرسائل" الداخلي — الجداول + الصلاحيات الهرمية + الدوال + الجدولة
-- ============================================================================
-- يعتمد بالكامل على users / manager_id / get_user_subtree / get_user_ancestors
-- / notifications الموجودين مسبقاً. لا توجد جداول مستخدمين أو صلاحيات مكررة.
-- Super Admin مستبعد كلياً من كل اتجاه (لا يظهر، لا يمكن مراسلته).
--
-- منطق المراسلة (دالة can_message):
--   • أي مستخدم يراسل كامل من تحته فى الهيكل (subtree).
--   • أي مستخدم يراسل مديره المباشر فقط (باستثناء Super Admin).
--   • استثناء صريح من الاسبك: المراقب (supervisor) يراسل أيضاً مدير التطوير
--     (development_manager) تخطياً لمستوى المراقب العام.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 0) توسيع الـ enums الموجودة (بدون إنشاء جداول/أنواع مكررة)
-- ----------------------------------------------------------------------------
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'new_message';
ALTER TYPE notification_type ADD VALUE IF NOT EXISTS 'message_mention';
ALTER TYPE action_type ADD VALUE IF NOT EXISTS 'message_delete_all';

-- ----------------------------------------------------------------------------
-- 1) الجداول
-- ----------------------------------------------------------------------------

-- محادثات (فردية أو جماعية)
CREATE TABLE IF NOT EXISTS conversations (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    type                text NOT NULL CHECK (type IN ('direct', 'group')),
    title               text,
    is_group_auto       boolean NOT NULL DEFAULT false, -- محادثة فريق تلقائية من الهيكل الوظيفي
    hierarchy_manager_id uuid REFERENCES users(id) ON DELETE CASCADE, -- المدير المالك لمحادثة الفريق التلقائية
    created_by          uuid REFERENCES users(id),
    last_message_at     timestamptz,
    last_message_preview text,
    created_at          timestamptz NOT NULL DEFAULT now(),
    updated_at          timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE conversations IS 'محادثات نظام الرسائل الداخلي (فردية/جماعية). الجماعية تُنشأ تلقائياً من الهيكل الوظيفي فقط.';

-- أعضاء المحادثة
CREATE TABLE IF NOT EXISTS conversation_members (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_pinned       boolean NOT NULL DEFAULT false,
    last_read_at    timestamptz,
    joined_at       timestamptz NOT NULL DEFAULT now(),
    UNIQUE (conversation_id, user_id)
);

-- الرسائل (نصية فقط — بدون أي مرفقات نهائياً)
CREATE TABLE IF NOT EXISTS messages (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    conversation_id         uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    sender_id               uuid NOT NULL REFERENCES users(id),
    content                 text NOT NULL CHECK (char_length(content) BETWEEN 1 AND 4000),
    reply_to_message_id     uuid REFERENCES messages(id) ON DELETE SET NULL,
    forwarded_from_message_id uuid REFERENCES messages(id) ON DELETE SET NULL,
    mentions                uuid[] NOT NULL DEFAULT '{}',
    is_pinned               boolean NOT NULL DEFAULT false,
    is_edited               boolean NOT NULL DEFAULT false,
    edited_at               timestamptz,
    is_deleted              boolean NOT NULL DEFAULT false,      -- محذوفة للجميع
    deleted_for_everyone_at timestamptz,
    hidden_for              uuid[] NOT NULL DEFAULT '{}',        -- حذف لدى المستخدم نفسه فقط
    created_at              timestamptz NOT NULL DEFAULT now(),
    updated_at              timestamptz NOT NULL DEFAULT now()
);

COMMENT ON COLUMN messages.content IS 'نص فقط (يشمل Emoji). ممنوع نهائياً أي مرفقات صور/فيديو/ملفات/صوت.';

-- حالة الاستلام/القراءة لكل رسالة لكل مستخدم فى المحادثة
CREATE TABLE IF NOT EXISTS message_reads (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id   uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
    user_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    delivered_at timestamptz,
    read_at      timestamptz,
    UNIQUE (message_id, user_id)
);

-- مؤشر "يكتب الآن" (سطر واحد لكل مستخدم/محادثة، يُحدَّث ولا يتراكم)
CREATE TABLE IF NOT EXISTS typing_status (
    conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    is_typing       boolean NOT NULL DEFAULT true,
    updated_at      timestamptz NOT NULL DEFAULT now(),
    PRIMARY KEY (conversation_id, user_id)
);

-- حالة الاتصال العامة للمستخدم (Online/Offline/آخر ظهور)
CREATE TABLE IF NOT EXISTS online_status (
    user_id      uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    is_online    boolean NOT NULL DEFAULT false,
    last_seen_at timestamptz NOT NULL DEFAULT now(),
    updated_at   timestamptz NOT NULL DEFAULT now()
);

-- ----------------------------------------------------------------------------
-- 2) الفهارس
-- ----------------------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_conv_members_user           ON conversation_members(user_id);
CREATE INDEX IF NOT EXISTS idx_conv_members_conversation    ON conversation_members(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversations_last_message   ON conversations(last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_conversations_manager        ON conversations(hierarchy_manager_id) WHERE hierarchy_manager_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_conversation_time   ON messages(conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender              ON messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_reply_to             ON messages(reply_to_message_id) WHERE reply_to_message_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_messages_pinned               ON messages(conversation_id) WHERE is_pinned = true;
CREATE INDEX IF NOT EXISTS idx_messages_mentions_gin         ON messages USING gin(mentions);
CREATE INDEX IF NOT EXISTS idx_messages_content_trgm         ON messages USING gin (content gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_message_reads_user            ON message_reads(user_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_message         ON message_reads(message_id);
CREATE INDEX IF NOT EXISTS idx_message_reads_unread          ON message_reads(user_id) WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_typing_status_conversation    ON typing_status(conversation_id);

-- ----------------------------------------------------------------------------
-- 3) تريجرات updated_at (تعيد استخدام الدالة العامة الموجودة فى النظام)
-- ----------------------------------------------------------------------------
DROP TRIGGER IF EXISTS update_conversations_updated_at ON conversations;
CREATE TRIGGER update_conversations_updated_at
    BEFORE UPDATE ON conversations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

DROP TRIGGER IF EXISTS update_messages_updated_at ON messages;
CREATE TRIGGER update_messages_updated_at
    BEFORE UPDATE ON messages
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- ----------------------------------------------------------------------------
-- 4) دالة الصلاحيات الهرمية للمراسلة — قلب النظام
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_message(p_sender uuid, p_recipient uuid)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_sender_role    user_role;
    v_sender_manager uuid;
    v_recipient_role user_role;
BEGIN
    IF p_sender IS NULL OR p_recipient IS NULL OR p_sender = p_recipient THEN
        RETURN false;
    END IF;

    SELECT role, manager_id INTO v_sender_role, v_sender_manager
    FROM users WHERE id = p_sender AND deleted_at IS NULL AND is_active;

    SELECT role INTO v_recipient_role
    FROM users WHERE id = p_recipient AND deleted_at IS NULL AND is_active;

    IF v_sender_role IS NULL OR v_recipient_role IS NULL THEN
        RETURN false;
    END IF;

    -- Super Admin لا يظهر ولا يمكن مراسلته إطلاقاً فى أي اتجاه
    IF v_sender_role = 'super_admin' OR v_recipient_role = 'super_admin' THEN
        RETURN false;
    END IF;

    -- كل من تحت المستخدم فى الهيكل الوظيفي (subtree يشمل المستخدم نفسه، مستبعد أعلاه)
    IF p_recipient = ANY (get_user_subtree(p_sender)) THEN
        RETURN true;
    END IF;

    -- المدير المباشر
    IF p_recipient = v_sender_manager THEN
        RETURN true;
    END IF;

    -- استثناء صريح بنص المتطلبات: المراقب يراسل أيضاً مدير التطوير (تخطي مستوى)
    IF v_sender_role = 'supervisor' AND v_recipient_role = 'development_manager' THEN
        RETURN true;
    END IF;

    RETURN false;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.can_message(uuid, uuid) TO authenticated;

-- قائمة كل من يحق للمستخدم الحالي مراسلتهم (لعمل محادثة جديدة / البحث عن مستخدم)
CREATE OR REPLACE FUNCTION public.list_messageable_users()
RETURNS TABLE (
    id uuid, name text, role user_role, avatar_url text,
    is_online boolean, last_seen_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT u.id, u.name, u.role, u.avatar_url,
           COALESCE(os.is_online, false), os.last_seen_at
    FROM users u
    LEFT JOIN online_status os ON os.user_id = u.id
    WHERE u.deleted_at IS NULL AND u.is_active
      AND public.can_message(auth.uid(), u.id)
    ORDER BY u.name;
$function$;

GRANT EXECUTE ON FUNCTION public.list_messageable_users() TO authenticated;

-- ----------------------------------------------------------------------------
-- 5) إنشاء/جلب محادثة فردية
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_or_create_direct_conversation(p_target_user_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_conversation_id uuid;
BEGIN
    IF NOT public.can_message(auth.uid(), p_target_user_id) THEN
        RAISE EXCEPTION 'غير مصرح لك بمراسلة هذا المستخدم' USING ERRCODE = '42501';
    END IF;

    SELECT c.id INTO v_conversation_id
    FROM conversations c
    WHERE c.type = 'direct'
      AND EXISTS (SELECT 1 FROM conversation_members m WHERE m.conversation_id = c.id AND m.user_id = auth.uid())
      AND EXISTS (SELECT 1 FROM conversation_members m WHERE m.conversation_id = c.id AND m.user_id = p_target_user_id)
    LIMIT 1;

    IF v_conversation_id IS NOT NULL THEN
        RETURN v_conversation_id;
    END IF;

    INSERT INTO conversations (type, created_by) VALUES ('direct', auth.uid())
    RETURNING id INTO v_conversation_id;

    INSERT INTO conversation_members (conversation_id, user_id)
    VALUES (v_conversation_id, auth.uid()), (v_conversation_id, p_target_user_id);

    RETURN v_conversation_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_or_create_direct_conversation(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 6) إرسال رسالة (يتحقق من العضوية + يحدّث ملخص المحادثة + ينشئ إشعارات)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.send_message(
    p_conversation_id uuid,
    p_content text,
    p_reply_to_message_id uuid DEFAULT NULL,
    p_mentions uuid[] DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_message_id uuid;
    v_sender_name text;
    v_preview text;
    v_recipient_ids uuid[];
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM conversation_members
        WHERE conversation_id = p_conversation_id AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'أنت لست عضواً فى هذه المحادثة' USING ERRCODE = '42501';
    END IF;

    IF p_content IS NULL OR length(trim(p_content)) = 0 THEN
        RAISE EXCEPTION 'لا يمكن إرسال رسالة فارغة';
    END IF;

    INSERT INTO messages (conversation_id, sender_id, content, reply_to_message_id, mentions)
    VALUES (p_conversation_id, auth.uid(), p_content, p_reply_to_message_id,
            COALESCE(p_mentions, '{}'))
    RETURNING id INTO v_message_id;

    v_preview := left(p_content, 120);

    UPDATE conversations
    SET last_message_at = now(), last_message_preview = v_preview
    WHERE id = p_conversation_id;

    -- تهيئة سجل قراءة لباقي الأعضاء (delivered عند الإدراج، read لاحقاً)
    INSERT INTO message_reads (message_id, user_id, delivered_at)
    SELECT v_message_id, cm.user_id, now()
    FROM conversation_members cm
    WHERE cm.conversation_id = p_conversation_id AND cm.user_id <> auth.uid();

    SELECT name INTO v_sender_name FROM users WHERE id = auth.uid();

    SELECT array_agg(cm.user_id) INTO v_recipient_ids
    FROM conversation_members cm
    WHERE cm.conversation_id = p_conversation_id AND cm.user_id <> auth.uid();

    IF v_recipient_ids IS NOT NULL THEN
        PERFORM notify_users(
            v_recipient_ids, 'new_message', 'رسالة جديدة من ' || COALESCE(v_sender_name, 'مستخدم'),
            v_preview, 'conversation', p_conversation_id
        );
    END IF;

    IF p_mentions IS NOT NULL AND array_length(p_mentions, 1) > 0 THEN
        PERFORM notify_users(
            p_mentions, 'message_mention', COALESCE(v_sender_name, 'مستخدم') || ' أشار إليك فى رسالة',
            v_preview, 'conversation', p_conversation_id
        );
    END IF;

    RETURN v_message_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.send_message(uuid, text, uuid, uuid[]) TO authenticated;

-- ----------------------------------------------------------------------------
-- 7) تعديل رسالة (خلال 15 دقيقة من صاحبها فقط)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.edit_message(p_message_id uuid, p_new_content text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF p_new_content IS NULL OR length(trim(p_new_content)) = 0 THEN
        RAISE EXCEPTION 'لا يمكن أن تكون الرسالة فارغة';
    END IF;

    UPDATE messages
    SET content = p_new_content, is_edited = true, edited_at = now()
    WHERE id = p_message_id
      AND sender_id = auth.uid()
      AND is_deleted = false
      AND created_at > now() - interval '15 minutes';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'لا يمكن تعديل هذه الرسالة (انتهت مهلة الـ 15 دقيقة أو لست صاحبها)' USING ERRCODE = '42501';
    END IF;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.edit_message(uuid, text) TO authenticated;

-- ----------------------------------------------------------------------------
-- 8) حذف رسالة — لدى المستخدم نفسه فقط (بدون مهلة زمنية)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_message_for_self(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE messages
    SET hidden_for = array_append(hidden_for, auth.uid())
    WHERE id = p_message_id
      AND NOT (auth.uid() = ANY(hidden_for))
      AND EXISTS (
          SELECT 1 FROM conversation_members
          WHERE conversation_id = messages.conversation_id AND user_id = auth.uid()
      );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_message_for_self(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 9) حذف رسالة للجميع — صاحبها فقط، خلال أول دقيقتين من الإرسال
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.delete_message_for_everyone(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE messages
    SET is_deleted = true,
        deleted_for_everyone_at = now(),
        content = '',
        is_pinned = false
    WHERE id = p_message_id
      AND sender_id = auth.uid()
      AND created_at > now() - interval '2 minutes';

    IF NOT FOUND THEN
        RAISE EXCEPTION 'لا يمكن حذف الرسالة للجميع (انتهت مهلة الدقيقتين أو لست صاحبها)' USING ERRCODE = '42501';
    END IF;

    INSERT INTO activity_logs (user_id, action_type, entity_type, entity_id)
    VALUES (auth.uid(), 'message_delete_all', 'message', p_message_id);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.delete_message_for_everyone(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 10) تثبيت/إلغاء تثبيت رسالة أو محادثة، وإعادة توجيه رسالة
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.toggle_pin_message(p_message_id uuid, p_pin boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE messages m
    SET is_pinned = p_pin
    WHERE m.id = p_message_id
      AND m.is_deleted = false
      AND EXISTS (
          SELECT 1 FROM conversation_members cm
          WHERE cm.conversation_id = m.conversation_id AND cm.user_id = auth.uid()
      );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.toggle_pin_message(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.toggle_pin_conversation(p_conversation_id uuid, p_pin boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE conversation_members
    SET is_pinned = p_pin
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.toggle_pin_conversation(uuid, boolean) TO authenticated;

CREATE OR REPLACE FUNCTION public.forward_message(p_message_id uuid, p_target_conversation_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_original messages%ROWTYPE;
    v_new_id uuid;
BEGIN
    SELECT * INTO v_original FROM messages WHERE id = p_message_id AND is_deleted = false;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'الرسالة غير موجودة';
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM conversation_members
        WHERE conversation_id = v_original.conversation_id AND user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'غير مصرح' USING ERRCODE = '42501';
    END IF;

    v_new_id := public.send_message(p_target_conversation_id, v_original.content);

    UPDATE messages SET forwarded_from_message_id = p_message_id WHERE id = v_new_id;

    RETURN v_new_id;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.forward_message(uuid, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 11) تحديد المحادثة كمقروءة (تُستدعى عند فتح المحادثة)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_conversation_read(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM conversation_members
        WHERE conversation_id = p_conversation_id AND user_id = auth.uid()
    ) THEN
        RETURN;
    END IF;

    UPDATE message_reads mr
    SET delivered_at = COALESCE(mr.delivered_at, now()), read_at = now()
    FROM messages m
    WHERE mr.message_id = m.id
      AND m.conversation_id = p_conversation_id
      AND mr.user_id = auth.uid()
      AND mr.read_at IS NULL;

    UPDATE conversation_members
    SET last_read_at = now()
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.mark_conversation_read(uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 12) مؤشر الكتابة الآن
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_typing_status(p_conversation_id uuid, p_is_typing boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM conversation_members
        WHERE conversation_id = p_conversation_id AND user_id = auth.uid()
    ) THEN
        RETURN;
    END IF;

    INSERT INTO typing_status (conversation_id, user_id, is_typing, updated_at)
    VALUES (p_conversation_id, auth.uid(), p_is_typing, now())
    ON CONFLICT (conversation_id, user_id)
    DO UPDATE SET is_typing = p_is_typing, updated_at = now();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_typing_status(uuid, boolean) TO authenticated;

-- ----------------------------------------------------------------------------
-- 13) حالة الاتصال (Online/Offline/آخر ظهور)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.set_online_status(p_is_online boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    INSERT INTO online_status (user_id, is_online, last_seen_at, updated_at)
    VALUES (auth.uid(), p_is_online, now(), now())
    ON CONFLICT (user_id)
    DO UPDATE SET is_online = p_is_online, last_seen_at = now(), updated_at = now();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.set_online_status(boolean) TO authenticated;

-- ----------------------------------------------------------------------------
-- 14) البحث داخل محادثة واحدة أو فى كل المحادثات المسموح بها (pg_trgm)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.search_messages(p_query text, p_conversation_id uuid DEFAULT NULL)
RETURNS TABLE (
    message_id uuid, conversation_id uuid, sender_id uuid, sender_name text,
    content text, created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
    SELECT m.id, m.conversation_id, m.sender_id, u.name, m.content, m.created_at
    FROM messages m
    JOIN conversation_members cm ON cm.conversation_id = m.conversation_id AND cm.user_id = auth.uid()
    JOIN users u ON u.id = m.sender_id
    WHERE m.is_deleted = false
      AND NOT (auth.uid() = ANY (m.hidden_for))
      AND (p_conversation_id IS NULL OR m.conversation_id = p_conversation_id)
      AND m.content ILIKE '%' || p_query || '%'
    ORDER BY m.created_at DESC
    LIMIT 100;
$function$;

GRANT EXECUTE ON FUNCTION public.search_messages(text, uuid) TO authenticated;

-- ----------------------------------------------------------------------------
-- 15) عدد الرسائل غير المقروءة إجمالاً للمستخدم الحالي (للـ Badge بالتطبيق)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_my_unread_messages_count()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO 'public'
AS $function$
    SELECT COUNT(*)::int
    FROM message_reads mr
    JOIN messages m ON m.id = mr.message_id
    WHERE mr.user_id = auth.uid()
      AND mr.read_at IS NULL
      AND m.is_deleted = false
      AND NOT (auth.uid() = ANY (m.hidden_for));
$function$;

GRANT EXECUTE ON FUNCTION public.get_my_unread_messages_count() TO authenticated;

-- ----------------------------------------------------------------------------
-- 16) المحادثات الجماعية التلقائية حسب الهيكل الوظيفي
--     كل مدير (Group Leader فما فوق، وليس Super Admin) له محادثة فريق واحدة
--     تلقائية تضمّه هو + كل من يرأسهم مباشرة (manager_id). تُنشأ أول مرة يكون
--     لديه فيها مرؤوس مباشر، وتُزامَن تلقائياً مع أي تغيير فى الهيكل الوظيفي.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sync_hierarchy_group_conversation(p_manager_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_manager users%ROWTYPE;
    v_conversation_id uuid;
    v_direct_reports uuid[];
BEGIN
    IF p_manager_id IS NULL THEN RETURN; END IF;

    SELECT * INTO v_manager FROM users WHERE id = p_manager_id;
    IF NOT FOUND OR v_manager.role = 'super_admin' THEN RETURN; END IF;

    SELECT array_agg(id) INTO v_direct_reports
    FROM users
    WHERE manager_id = p_manager_id AND deleted_at IS NULL AND is_active;

    SELECT id INTO v_conversation_id
    FROM conversations
    WHERE hierarchy_manager_id = p_manager_id AND is_group_auto = true;

    -- لا يوجد مرؤوسين حالياً: لا داعي لإنشاء محادثة جديدة (نُبقي أي محادثة قائمة كما هي لحفظ الأرشيف)
    IF v_direct_reports IS NULL THEN
        RETURN;
    END IF;

    IF v_conversation_id IS NULL THEN
        INSERT INTO conversations (type, title, is_group_auto, hierarchy_manager_id, created_by)
        VALUES ('group', 'فريق ' || v_manager.name, true, p_manager_id, p_manager_id)
        RETURNING id INTO v_conversation_id;

        INSERT INTO conversation_members (conversation_id, user_id) VALUES (v_conversation_id, p_manager_id);
    ELSE
        UPDATE conversations SET title = 'فريق ' || v_manager.name WHERE id = v_conversation_id;
    END IF;

    -- إضافة أي مرؤوس جديد غير موجود بعد
    INSERT INTO conversation_members (conversation_id, user_id)
    SELECT v_conversation_id, uid FROM unnest(v_direct_reports) AS uid
    ON CONFLICT (conversation_id, user_id) DO NOTHING;

    -- إزالة من لم يعد مرؤوساً مباشراً (مع الإبقاء على المدير نفسه دوماً)
    DELETE FROM conversation_members
    WHERE conversation_id = v_conversation_id
      AND user_id <> p_manager_id
      AND user_id <> ALL (v_direct_reports);
END;
$function$;

CREATE OR REPLACE FUNCTION public.trigger_sync_hierarchy_groups()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    IF TG_OP = 'DELETE' OR TG_OP = 'UPDATE' THEN
        IF OLD.manager_id IS NOT NULL THEN
            PERFORM public.sync_hierarchy_group_conversation(OLD.manager_id);
        END IF;
    END IF;

    IF TG_OP = 'INSERT' OR TG_OP = 'UPDATE' THEN
        IF NEW.manager_id IS NOT NULL THEN
            PERFORM public.sync_hierarchy_group_conversation(NEW.manager_id);
        END IF;
        -- لو المستخدم نفسه مدير (له مرؤوسين)، أعد مزامنة محادثة فريقه أيضاً
        -- (يغطي حالات تغيير is_active/role/deleted_at الخاصة به هو)
        PERFORM public.sync_hierarchy_group_conversation(NEW.id);
    END IF;

    RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS sync_hierarchy_groups_on_users_change ON users;
CREATE TRIGGER sync_hierarchy_groups_on_users_change
    AFTER INSERT OR UPDATE OF manager_id, role, is_active, deleted_at OR DELETE ON users
    FOR EACH ROW EXECUTE FUNCTION public.trigger_sync_hierarchy_groups();

-- تهيئة أولية: إنشاء محادثات الفريق لكل من لديه مرؤوسون حالياً
DO $$
DECLARE
    v_manager_id uuid;
BEGIN
    FOR v_manager_id IN
        SELECT DISTINCT manager_id FROM users
        WHERE manager_id IS NOT NULL AND deleted_at IS NULL AND is_active
    LOOP
        PERFORM public.sync_hierarchy_group_conversation(v_manager_id);
    END LOOP;
END;
$$;

-- ----------------------------------------------------------------------------
-- 17) Row Level Security — كل مستخدم يرى فقط محادثاته المسموح له بها
-- ----------------------------------------------------------------------------
ALTER TABLE conversations         ENABLE ROW LEVEL SECURITY;
ALTER TABLE conversation_members  ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages              ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_reads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE typing_status         ENABLE ROW LEVEL SECURITY;
ALTER TABLE online_status         ENABLE ROW LEVEL SECURITY;

-- لا توجد سياسات INSERT/UPDATE/DELETE مباشرة على conversations أو
-- conversation_members عمداً: كل التعديل يتم فقط عبر الدوال أعلاه
-- (SECURITY DEFINER) لضمان تطبيق can_message فى كل مسار.

DROP POLICY IF EXISTS "conversations_select" ON conversations;
CREATE POLICY "conversations_select" ON conversations FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM conversation_members cm
            WHERE cm.conversation_id = conversations.id AND cm.user_id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS "conversation_members_select" ON conversation_members;
CREATE POLICY "conversation_members_select" ON conversation_members FOR SELECT
    TO authenticated
    USING (
        conversation_id IN (
            SELECT cm.conversation_id FROM conversation_members cm WHERE cm.user_id = (SELECT auth.uid())
        )
    );

-- السماح للمستخدم بتحديث صف عضويته الخاص فقط (تثبيت المحادثة/آخر قراءة) — احتياطاً،
-- مع أن toggle_pin_conversation و mark_conversation_read كافيتان بمفردهما
DROP POLICY IF EXISTS "conversation_members_update_own" ON conversation_members;
CREATE POLICY "conversation_members_update_own" ON conversation_members FOR UPDATE
    TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "messages_select" ON messages;
CREATE POLICY "messages_select" ON messages FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM conversation_members cm
            WHERE cm.conversation_id = messages.conversation_id AND cm.user_id = (SELECT auth.uid())
        )
    );

-- لا توجد سياسة INSERT/UPDATE مباشرة على messages: الإرسال/التعديل/الحذف/
-- التثبيت كلها فقط عبر send_message / edit_message / delete_message_for_* /
-- toggle_pin_message لضمان فرض المهلة الزمنية وقواعد الملكية دائماً.

DROP POLICY IF EXISTS "message_reads_select" ON message_reads;
CREATE POLICY "message_reads_select" ON message_reads FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM messages m
            JOIN conversation_members cm ON cm.conversation_id = m.conversation_id
            WHERE m.id = message_reads.message_id AND cm.user_id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS "message_reads_insert_own" ON message_reads;
CREATE POLICY "message_reads_insert_own" ON message_reads FOR INSERT
    TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "message_reads_update_own" ON message_reads;
CREATE POLICY "message_reads_update_own" ON message_reads FOR UPDATE
    TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "typing_status_select" ON typing_status;
CREATE POLICY "typing_status_select" ON typing_status FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM conversation_members cm
            WHERE cm.conversation_id = typing_status.conversation_id AND cm.user_id = (SELECT auth.uid())
        )
    );

DROP POLICY IF EXISTS "typing_status_upsert_own" ON typing_status;
CREATE POLICY "typing_status_upsert_own" ON typing_status FOR INSERT
    TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "typing_status_update_own" ON typing_status;
CREATE POLICY "typing_status_update_own" ON typing_status FOR UPDATE
    TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "typing_status_delete_own" ON typing_status;
CREATE POLICY "typing_status_delete_own" ON typing_status FOR DELETE
    TO authenticated
    USING (user_id = (SELECT auth.uid()));

-- حالة الاتصال: يمكن لأي مستخدم مصرح له بمراسلة آخر أن يرى حالته (فى أي اتجاه)
DROP POLICY IF EXISTS "online_status_select" ON online_status;
CREATE POLICY "online_status_select" ON online_status FOR SELECT
    TO authenticated
    USING (
        user_id = (SELECT auth.uid())
        OR public.can_message((SELECT auth.uid()), user_id)
        OR public.can_message(user_id, (SELECT auth.uid()))
    );

DROP POLICY IF EXISTS "online_status_upsert_own" ON online_status;
CREATE POLICY "online_status_upsert_own" ON online_status FOR INSERT
    TO authenticated
    WITH CHECK (user_id = (SELECT auth.uid()));

DROP POLICY IF EXISTS "online_status_update_own" ON online_status;
CREATE POLICY "online_status_update_own" ON online_status FOR UPDATE
    TO authenticated
    USING (user_id = (SELECT auth.uid()))
    WITH CHECK (user_id = (SELECT auth.uid()));

-- ----------------------------------------------------------------------------
-- 18) منع anon من كل دوال المراسلة (نفس نمط التشديد الأمني المتّبع فى المشروع)
-- ----------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.can_message(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.list_messageable_users() FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_or_create_direct_conversation(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.send_message(uuid, text, uuid, uuid[]) FROM anon;
REVOKE EXECUTE ON FUNCTION public.edit_message(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_message_for_self(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_message_for_everyone(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.toggle_pin_message(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.toggle_pin_conversation(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.forward_message(uuid, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.mark_conversation_read(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_typing_status(uuid, boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.set_online_status(boolean) FROM anon;
REVOKE EXECUTE ON FUNCTION public.search_messages(text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_my_unread_messages_count() FROM anon;

-- ----------------------------------------------------------------------------
-- 19) سياسة الاحتفاظ بالرسائل 90 يوماً — حذف تلقائي يومي عبر pg_cron
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_old_messages()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    DELETE FROM messages WHERE created_at < now() - interval '90 days';
    DELETE FROM typing_status WHERE updated_at < now() - interval '1 day';
END;
$function$;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'purge-old-messages';

SELECT cron.schedule(
    'purge-old-messages',
    '30 3 * * *',
    'SELECT public.purge_old_messages();'
);

-- ----------------------------------------------------------------------------
-- 20) تفعيل Supabase Realtime على جداول المراسلة
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE conversations;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE conversation_members;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE messages;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE message_reads;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE typing_status;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
    BEGIN
        ALTER PUBLICATION supabase_realtime ADD TABLE online_status;
    EXCEPTION WHEN duplicate_object THEN NULL; END;
END;
$$;

ALTER TABLE messages REPLICA IDENTITY FULL;
ALTER TABLE message_reads REPLICA IDENTITY FULL;
ALTER TABLE typing_status REPLICA IDENTITY FULL;
ALTER TABLE conversation_members REPLICA IDENTITY FULL;
ALTER TABLE conversations REPLICA IDENTITY FULL;
ALTER TABLE online_status REPLICA IDENTITY FULL;
