-- إصلاح: سياسات customers كانت تسمح بالتعديل/الحذف فقط لـ owner_id = auth.uid()
-- بدون اعتبار التسلسل الهرمي، بخلاف جدول policies الذي يسمح بذلك لأي مدير
-- في التسلسل الهرمي (owner_id IN subtree). هذا التضارب غير منطقي تجارياً:
-- المدير يستطيع تعديل وثيقة وكيله لكن لا يستطيع تعديل بيانات نفس العميل.
-- التعديل: مطابقة سياسة customers مع نفس منطق policies (تعديل بصلاحية
-- التسلسل الهرمي)، مع الحفاظ على الحذف مقيداً بالمالك المباشر فقط
-- (الحذف عملية أكثر خطورة، نفس منطق policies_delete_owner).

DROP POLICY IF EXISTS "customers_update_owner" ON customers;
CREATE POLICY "customers_update_hierarchy" ON customers FOR UPDATE
    TO authenticated
    USING (owner_id IN (SELECT unnest(get_user_subtree(auth.uid()))))
    WITH CHECK (owner_id IN (SELECT unnest(get_user_subtree(auth.uid()))));
;
