import { format } from 'date-fns';

// تاريخ بداية التأمين الافتراضي عند إصدار وثيقة جديدة:
// - لو تاريخ اليوم من 1 حتى 15 من الشهر: أول يوم فى الشهر الحالي
// - لو تاريخ اليوم من 16 حتى آخر يوم فى الشهر: أول يوم فى الشهر التالي
// يُحتسب دائماً بناءً على تاريخ اليوم وقت فتح نموذج "إصدار وثيقة جديدة"، ولا
// يُحتفظ بآخر تاريخ استُخدم فى مرة سابقة. المستخدم يظل قادراً على تعديله يدوياً.
export function computeDefaultPolicyStartDate(referenceDate: Date = new Date()): string {
  const day = referenceDate.getDate();
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();

  const targetMonthDate = day <= 15
    ? new Date(year, month, 1)
    : new Date(year, month + 1, 1);

  return format(targetMonthDate, 'yyyy-MM-dd');
}
