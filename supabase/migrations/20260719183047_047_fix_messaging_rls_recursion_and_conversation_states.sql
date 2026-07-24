-- ============================================================================
-- 047: إصلاح مشكلة "infinite recursion" فى صلاحيات نظام الرسائل + إضافة
-- حالات المحادثة (كتم/أرشفة/حذف من القائمة) المطلوبة لتطوير صفحة الرسائل
-- ============================================================================
-- ملاحظة: هذا الملف يعيد إنتاج نفس التعديل المطبَّق بالفعل على قاعدة بيانات
-- الإنتاج (تم تطبيقه مباشرة سابقاً) — إضافته هنا فقط لمزامنة الكود المصدري
-- مع الحالة الفعلية لقاعدة البيانات، حتى تبقى ملفات migrations مطابقة تماماً
-- لما هو منفَّذ فعلياً ولا يحدث انحراف بينهما مستقبلاً.

-- ----------------------------------------------------------------------------
-- 1) السبب الجذري للخطأ: سياسة conversation_members_select كانت تستعلم من
--    نفس جدول conversation_members داخل شرطها، وهو نمط يسبب دائماً
--    "infinite recursion detected in policy" فى Postgres. كل سياسة أخرى
--    تستعلم من conversation_members (على أي جدول) تتعطل بنفس الخطأ أيضاً
--    لأنها تستدعي سياسته المعطوبة. الحل القياسي: دالة SECURITY DEFINER
--    تتجاوز RLS عند التحقق من العضوية.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_conversation_member(p_conversation_id uuid, p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
    SELECT EXISTS (
        SELECT 1 FROM conversation_members
        WHERE conversation_id = p_conversation_id AND user_id = p_user_id
    );
$function$;

REVOKE EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.is_conversation_member(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "conversations_select" ON conversations;
CREATE POLICY "conversations_select" ON conversations FOR SELECT
    TO authenticated
    USING (public.is_conversation_member(conversations.id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "conversation_members_select" ON conversation_members;
CREATE POLICY "conversation_members_select" ON conversation_members FOR SELECT
    TO authenticated
    USING (public.is_conversation_member(conversation_members.conversation_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "messages_select" ON messages;
CREATE POLICY "messages_select" ON messages FOR SELECT
    TO authenticated
    USING (public.is_conversation_member(messages.conversation_id, (SELECT auth.uid())));

DROP POLICY IF EXISTS "message_reads_select" ON message_reads;
CREATE POLICY "message_reads_select" ON message_reads FOR SELECT
    TO authenticated
    USING (
        EXISTS (
            SELECT 1 FROM messages m
            WHERE m.id = message_reads.message_id
              AND public.is_conversation_member(m.conversation_id, (SELECT auth.uid()))
        )
    );

DROP POLICY IF EXISTS "typing_status_select" ON typing_status;
CREATE POLICY "typing_status_select" ON typing_status FOR SELECT
    TO authenticated
    USING (public.is_conversation_member(typing_status.conversation_id, (SELECT auth.uid())));

-- ----------------------------------------------------------------------------
-- 2) حالات المحادثة لكل عضو: كتم الإشعارات / أرشفة / حذف من القائمة الخاصة
--    (بدون حذف الرسائل ولا التأثير على الطرف الآخر)
-- ----------------------------------------------------------------------------
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS is_muted    boolean NOT NULL DEFAULT false;
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS is_archived boolean NOT NULL DEFAULT false;
ALTER TABLE conversation_members ADD COLUMN IF NOT EXISTS is_hidden   boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.toggle_mute_conversation(p_conversation_id uuid, p_mute boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE conversation_members
    SET is_muted = p_mute
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.toggle_mute_conversation(uuid, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.toggle_mute_conversation(uuid, boolean) FROM anon;

CREATE OR REPLACE FUNCTION public.toggle_archive_conversation(p_conversation_id uuid, p_archive boolean)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE conversation_members
    SET is_archived = p_archive
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.toggle_archive_conversation(uuid, boolean) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.toggle_archive_conversation(uuid, boolean) FROM anon;

-- حذف المحادثة من قائمة المستخدم فقط (لا يمس عضوية الطرف الآخر ولا الرسائل)
CREATE OR REPLACE FUNCTION public.hide_conversation_for_self(p_conversation_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
    UPDATE conversation_members
    SET is_hidden = true, is_pinned = false
    WHERE conversation_id = p_conversation_id AND user_id = auth.uid();
END;
$function$;

GRANT EXECUTE ON FUNCTION public.hide_conversation_for_self(uuid) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.hide_conversation_for_self(uuid) FROM anon;

-- ----------------------------------------------------------------------------
-- 3) عند وصول رسالة جديدة: إعادة إظهار المحادثة لمن كان قد حذفها من قائمته
--    فقط (حتى لا تضيع عليه رسالة جديدة)، دون المساس بحالة الأرشفة/الكتم
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

    -- إعادة إظهار المحادثة لأي عضو كان قد حذفها من قائمته الخاصة
    UPDATE conversation_members
    SET is_hidden = false
    WHERE conversation_id = p_conversation_id AND is_hidden = true;

    -- تهيئة سجل قراءة لباقي الأعضاء (delivered عند الإدراج، read لاحقاً)
    INSERT INTO message_reads (message_id, user_id, delivered_at)
    SELECT v_message_id, cm.user_id, now()
    FROM conversation_members cm
    WHERE cm.conversation_id = p_conversation_id AND cm.user_id <> auth.uid();

    SELECT name INTO v_sender_name FROM users WHERE id = auth.uid();

    SELECT array_agg(cm.user_id) INTO v_recipient_ids
    FROM conversation_members cm
    WHERE cm.conversation_id = p_conversation_id AND cm.user_id <> auth.uid() AND NOT cm.is_muted;

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
REVOKE EXECUTE ON FUNCTION public.send_message(uuid, text, uuid, uuid[]) FROM anon;

-- ----------------------------------------------------------------------------
-- 4) get_or_create_direct_conversation: لو المحادثة موجودة لكن كانت مخفية
--    لدى المستخدم الحالي (حذفها سابقاً)، أعد إظهارها بدل إرجاع معرّفها فقط
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
        UPDATE conversation_members
        SET is_hidden = false
        WHERE conversation_id = v_conversation_id AND user_id = auth.uid();
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
REVOKE EXECUTE ON FUNCTION public.get_or_create_direct_conversation(uuid) FROM anon;
