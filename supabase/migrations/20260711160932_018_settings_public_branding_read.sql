-- السماح بقراءة بيانات الشركة (الاسم والشعار) قبل تسجيل الدخول
-- عشان تظهر في صفحة الدخول، غير كده الجدول مقفول على المستخدمين المسجلين فقط
DROP POLICY IF EXISTS "settings_select_anon" ON settings;
CREATE POLICY "settings_select_anon" ON settings FOR SELECT
    TO anon
    USING (true);
