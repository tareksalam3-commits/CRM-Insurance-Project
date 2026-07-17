-- السماح لأي مدير بتسجيل دفعة (سداد) لوثيقة أي وكيل في فريقه (subtree)
-- مش بس الوكيل نفسه. paid_by_user_id لسه لازم يكون المستخدم الحالي (مين سجّل الدفعة فعلياً)
-- لكن الوثيقة المرتبطة ممكن تكون لأي حد تحته في الهيكل الإداري

DROP POLICY IF EXISTS "payments_insert_owner" ON payments;
CREATE POLICY "payments_insert_owner" ON payments
  FOR INSERT TO authenticated
  WITH CHECK (
    paid_by_user_id = auth.uid()
    AND installment_id IN (
      SELECT i.id
      FROM installments i
      JOIN policies p ON i.policy_id = p.id
      WHERE p.owner_id = auth.uid()
         OR p.owner_id IN (SELECT unnest(get_user_subtree(auth.uid())))
    )
  );
;
