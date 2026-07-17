-- دالة آمنة ومحدودة الغرض: تحويل رقم الهاتف إلى البريد الإلكتروني المرتبط به
-- تُستخدم فقط في شاشة تسجيل الدخول (قبل المصادقة)، ولا تُرجع أي بيانات غير البريد الإلكتروني
CREATE OR REPLACE FUNCTION get_email_by_phone(p_phone text)
RETURNS text
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT email FROM users
  WHERE phone = p_phone AND is_active = true
  LIMIT 1;
$$;

-- السماح لأي زائر غير مسجّل دخول (anon) وأي مستخدم مسجّل باستخدام الدالة
GRANT EXECUTE ON FUNCTION get_email_by_phone(text) TO anon, authenticated;
