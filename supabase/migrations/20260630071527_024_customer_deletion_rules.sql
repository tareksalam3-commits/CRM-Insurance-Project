-- دالة تتحقق هل العميل قابل للحذف: ممنوع لو عنده أي وثيقة (أياً كانت حالتها)
CREATE OR REPLACE FUNCTION public.can_delete_customer(p_customer_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  has_policy boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM policies WHERE customer_id = p_customer_id
  ) INTO has_policy;

  RETURN NOT has_policy;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.can_delete_customer(uuid) FROM anon;

-- تحديث policy حذف العميل: المالك أو مدير في الـ subtree، وبشرط عدم وجود وثائق
DROP POLICY IF EXISTS "customers_delete_owner" ON customers;
CREATE POLICY "customers_delete_owner" ON customers
  FOR DELETE TO authenticated
  USING (
    (owner_id = auth.uid() OR owner_id IN (SELECT unnest(get_user_subtree(auth.uid()))))
    AND can_delete_customer(id)
  );
;
