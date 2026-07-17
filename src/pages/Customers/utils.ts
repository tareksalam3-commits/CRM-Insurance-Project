export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 0
  }).format(amount);

// نفس الترتيب المستخدم فى أكتر من مكان (تفاصيل العميل + الطباعة): أحدث
// وثيقة أولاً حسب تاريخ البداية
export function sortPoliciesByStartDate<T extends { start_date: string }>(policies: T[]): T[] {
  return [...policies].sort(
    (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
  );
}
