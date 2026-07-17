// ملحوظة: الصفحة الأصلية (index.tsx) تستخدم مودال واحد فقط مشترك بين
// "إضافة" و"تعديل" عميل (نفس الحقول، ويتغيّر فقط العنوان ونص الزر حسب
// editingCustomer) — فمنعاً لتكرار نفس الفورم فى مكوّنين منفصلين (وما قد
// يسببه ذلك من اختلاف سلوك بين الاثنين مستقبلاً)، EditCustomerDialog يعيد
// تصدير نفس مكوّن AddCustomerDialog المشترك.
export { CustomerFormDialog as EditCustomerDialog } from './AddCustomerDialog';
