-- ============================================================================
-- 048: إصلاح ظهور اسم المُرسِل كـ "مستخدم" بدل اسمه الحقيقي فى نظام الرسائل
-- ============================================================================
-- السبب الجذري: سياسة "users_select_own_and_below" تسمح لأي مستخدم بقراءة
-- بياناته الشخصية + بيانات مرؤوسيه فقط (get_user_subtree)، ولا تسمح إطلاقاً
-- بقراءة بيانات أي مستخدم أعلى منه فى الهيكل الوظيفي. نظام الرسائل يستعلم من
-- جدول users مباشرة (SELECT / embed عبر PostgREST) لعرض اسم الطرف الآخر فى
-- المحادثة، اسم الأعضاء فى الجروب، واسم مُرسِل كل رسالة — وكلها تخضع لنفس
-- سياسة RLS. النتيجة: لو مديرك بعتلك رسالة، الاستعلام يرجع صف "users" فاضي
-- لأنه أعلى منك فى الهيكل، فتظهر الواجهة الاسم الاحتياطي "مستخدم" بدل اسمه.
--
-- الحل: دالة SECURITY DEFINER تتجاوز RLS، وتُرجع فقط بيانات المستخدمين الذين
-- يشتركون فعلياً مع صاحب الطلب فى محادثة واحدة على الأقل (بغض النظر عن اتجاه
-- الهيكل الوظيفي بينهما) — بدون فتح أي بيانات إضافية غير هذه الحالة.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_conversation_partners_info(p_user_ids uuid[])
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
    WHERE u.id = ANY(p_user_ids)
      AND EXISTS (
          SELECT 1
          FROM conversation_members cm_self
          JOIN conversation_members cm_other
            ON cm_other.conversation_id = cm_self.conversation_id
          WHERE cm_self.user_id = auth.uid()
            AND cm_other.user_id = u.id
      );
$function$;

REVOKE EXECUTE ON FUNCTION public.get_conversation_partners_info(uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_conversation_partners_info(uuid[]) TO authenticated;
