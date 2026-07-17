-- ================================================================
-- تفعيل نظام الإشعارات بالكامل: دوال مساعدة للتسلسل الإداري
-- ================================================================

-- إرجاع المستخدم نفسه + كل الرؤساء الأعلى منه في السلسلة الإدارية (عكس get_user_subtree)
CREATE OR REPLACE FUNCTION public.get_user_ancestors(p_user_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
DECLARE
    result uuid[];
BEGIN
    IF p_user_id IS NULL THEN RETURN ARRAY[]::uuid[]; END IF;

    WITH RECURSIVE ancestors AS (
        SELECT id, manager_id FROM users WHERE id = p_user_id
        UNION ALL
        SELECT u.id, u.manager_id
        FROM users u
        INNER JOIN ancestors a ON u.id = a.manager_id
    )
    SELECT array_agg(id) INTO result FROM ancestors;

    RETURN COALESCE(result, ARRAY[p_user_id]);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_user_ancestors(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.get_user_ancestors(uuid) FROM authenticated;

-- إدراج إشعار لمجموعة مستخدمين دفعة واحدة (مع استبعاد التكرار)
CREATE OR REPLACE FUNCTION public.notify_users(
    p_user_ids uuid[],
    p_type notification_type,
    p_title text,
    p_message text,
    p_entity_type text DEFAULT NULL,
    p_entity_id uuid DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF p_user_ids IS NULL OR array_length(p_user_ids, 1) IS NULL THEN RETURN; END IF;

    INSERT INTO notifications (user_id, type, title, message, entity_type, entity_id)
    SELECT DISTINCT uid, p_type, p_title, p_message, p_entity_type, p_entity_id
    FROM unnest(p_user_ids) AS uid
    WHERE uid IS NOT NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.notify_users(uuid[], notification_type, text, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.notify_users(uuid[], notification_type, text, text, text, uuid) FROM authenticated;
