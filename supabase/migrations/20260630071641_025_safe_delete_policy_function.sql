-- دالة حذف آمنة للوثيقة: تتحقق من الصلاحية والشرط، ثم تمسح بالترتيب الصحيح
-- (payments ثم installments ثم policy) داخل نفس العملية، متجاوزة قيود RESTRICT
-- لأنها SECURITY DEFINER وبترتيب صحيح

CREATE OR REPLACE FUNCTION public.delete_policy_safe(p_policy_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_owner_id uuid;
  v_caller_id uuid;
  v_can_access boolean;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'غير مصرح';
  END IF;

  SELECT owner_id INTO v_owner_id FROM policies WHERE id = p_policy_id;
  IF v_owner_id IS NULL THEN
    RAISE EXCEPTION 'الوثيقة غير موجودة';
  END IF;

  -- التحقق من الصلاحية: المالك نفسه أو مدير في الـ subtree الخاص به
  SELECT (v_owner_id = v_caller_id OR v_owner_id IN (SELECT unnest(get_user_subtree(v_caller_id))))
  INTO v_can_access;

  IF NOT v_can_access THEN
    RAISE EXCEPTION 'ليس لديك صلاحية لحذف هذه الوثيقة';
  END IF;

  -- التحقق من شرط الشهر: ممنوع لو فيها دفعة من شهر غير الشهر الحالي
  IF NOT can_delete_policy(p_policy_id) THEN
    RAISE EXCEPTION 'لا يمكن حذف الوثيقة لوجود دفعات مسددة من شهور سابقة';
  END IF;

  -- الحذف بالترتيب الصحيح
  DELETE FROM payments
  WHERE installment_id IN (SELECT id FROM installments WHERE policy_id = p_policy_id);

  DELETE FROM installments WHERE policy_id = p_policy_id;

  DELETE FROM policies WHERE id = p_policy_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.delete_policy_safe(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.delete_policy_safe(uuid) TO authenticated;

-- بنفس المنطق لـ can_delete_policy: نتأكد إنها بتاخد cancelled في الاعتبار صح (مراجعة)
-- الدالة الأصلية كانت صح بالفعل (is_cancelled = false فقط بتمنع)
;
