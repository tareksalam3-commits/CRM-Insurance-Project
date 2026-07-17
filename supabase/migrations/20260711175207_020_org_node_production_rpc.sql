/*
  دالة لحساب "الإنتاج الحالي" (مجموع تراكمي: هو + كل من تحته) لمجموعة مستخدمين
  دفعة واحدة، بتستخدمها صفحة الهيكل الوظيفي عشان تجيب أرقام الإنتاج بس لما
  المستخدم يفتح بطاقة معينة (Lazy Loading)، بدل ما تحسبها لكل موظفي الشركة
  من البداية. النطاق مقيد بنفس صلاحيات get_user_subtree الحالية (ما فيش أي
  تغيير في منطق الصلاحيات).
*/

CREATE OR REPLACE FUNCTION get_org_node_production(p_user_ids uuid[], p_month_start date)
RETURNS TABLE(user_id uuid, production numeric) AS $$
DECLARE
  v_caller_subtree uuid[];
BEGIN
  v_caller_subtree := get_user_subtree(auth.uid());

  RETURN QUERY
  SELECT uid, COALESCE(SUM(pay.amount), 0)::numeric
  FROM unnest(p_user_ids) AS uid
  LEFT JOIN LATERAL (
    SELECT p.amount
    FROM payments p
    JOIN installments i ON i.id = p.installment_id
    JOIN policies pol ON pol.id = i.policy_id
    WHERE pol.owner_id = ANY (get_user_subtree(uid))
      AND p.is_cancelled = false
      AND p.payment_month = p_month_start
  ) pay ON true
  WHERE uid = ANY (v_caller_subtree)
  GROUP BY uid;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION get_org_node_production(uuid[], date) TO authenticated;
