-- السماح للمدير (أي درجة فوق وكيل) بإضافة/تعديل/حذف عملاء لأي وكيل في فريقه (subtree)
-- مش بس عملاء نفسه. الوكيل نفسه لسه يقدر يدير عملاءه فقط.

DROP POLICY IF EXISTS "customers_insert_owner" ON customers;
CREATE POLICY "customers_insert_owner" ON customers
  FOR INSERT TO authenticated
  WITH CHECK (
    owner_id = auth.uid()
    OR owner_id IN (SELECT unnest(get_user_subtree(auth.uid())))
  );

DROP POLICY IF EXISTS "customers_update_owner" ON customers;
CREATE POLICY "customers_update_owner" ON customers
  FOR UPDATE TO authenticated
  USING (
    owner_id = auth.uid()
    OR owner_id IN (SELECT unnest(get_user_subtree(auth.uid())))
  )
  WITH CHECK (
    owner_id = auth.uid()
    OR owner_id IN (SELECT unnest(get_user_subtree(auth.uid())))
  );

DROP POLICY IF EXISTS "customers_delete_owner" ON customers;
CREATE POLICY "customers_delete_owner" ON customers
  FOR DELETE TO authenticated
  USING (
    owner_id = auth.uid()
    OR owner_id IN (SELECT unnest(get_user_subtree(auth.uid())))
  );
;
