-- دالة تتحقق هل الوثيقة قابلة للحذف:
-- ممنوع الحذف لو فيها أي دفعة (غير ملغاة) بـ payment_month مختلف عن الشهر الحالي
CREATE OR REPLACE FUNCTION public.can_delete_policy(p_policy_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  has_old_payment boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM payments p
    JOIN installments i ON i.id = p.installment_id
    WHERE i.policy_id = p_policy_id
      AND p.is_cancelled = false
      AND p.payment_month <> date_trunc('month', CURRENT_DATE)::date
  ) INTO has_old_payment;

  RETURN NOT has_old_payment;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_delete_policy(uuid) FROM anon;

-- تحديث policy الحذف: المالك أو أي مدير في الـ subtree، وبشرط can_delete_policy
DROP POLICY IF EXISTS "policies_delete_owner" ON policies;
CREATE POLICY "policies_delete_owner" ON policies
  FOR DELETE TO authenticated
  USING (
    (owner_id = auth.uid() OR owner_id IN (SELECT unnest(get_user_subtree(auth.uid()))))
    AND can_delete_policy(id)
  );

-- تحديث policy التعديل: المالك أو أي مدير في الـ subtree (نفس منطق customers)
DROP POLICY IF EXISTS "policies_update_owner" ON policies;
CREATE POLICY "policies_update_owner" ON policies
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid() OR owner_id IN (SELECT unnest(get_user_subtree(auth.uid())))
  )
  WITH CHECK (
    owner_id = auth.uid() OR owner_id IN (SELECT unnest(get_user_subtree(auth.uid())))
  );
;
