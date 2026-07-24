import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

export function formatReportDate(date: Date): string {
  return format(date, 'dd/MM/yyyy', { locale: ar });
}

export function formatReportDay(date: Date): string {
  return format(date, 'EEEE', { locale: ar });
}

/** يحوّل نص رقمي إلى عدد صحيح غير سالب (أي مدخل غير صالح يُعامل كصفر) */
export function toNonNegativeInt(value: string): number {
  const parsed = parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 0) return 0;
  return parsed;
}

export function formatDateInput(date: Date): string {
  return format(date, 'yyyy-MM-dd');
}

export function parseDateInput(value: string): Date {
  const [y, m, d] = value.split('-').map(Number);
  return new Date(y, m - 1, d);
}

// ==========================================================================
// فترة عرض الإحصائيات المجمّعة (يوم / أسبوع / شهر / ربع سنة) — الفترة
// الافتراضية قابلة للتعديل بالكامل يدوياً (تاريخ "من" و"إلى") من أي درجة،
// بحيث يقدر أي منهم يشوف أي فترة عن مرؤوسيه فى أي وقت بغض النظر عن الفترة
// الافتراضية لدرجته.
// ==========================================================================

export type StatsPeriodType = 'day' | 'week' | 'month' | 'quarter';

export const PERIOD_TYPE_LABELS: Record<StatsPeriodType, string> = {
  day: 'يوم',
  week: 'أسبوع',
  month: 'شهر',
  quarter: 'ربع سنة',
};

/** الفترة الافتراضية حسب درجة المستخدم (roleLevel): 1-2 = مدير تطوير فما
 * فوق → ربع سنوي، 3 = مراقب عام → شهري، 4 = مراقب → أسبوعي، 5-6 = رئيس
 * مجموعة/إيجنت → أسبوعي أيضاً (نطاق متابعة أقرب لحجم فريقهم/نشاطهم اليومي) */
export function defaultPeriodTypeForRole(roleLevel: number): StatsPeriodType {
  if (roleLevel <= 2) return 'quarter';
  if (roleLevel === 3) return 'month';
  return 'week';
}

/** يحسب نطاق تاريخ افتراضي (من/إلى) لنوع فترة معيّن، منتهياً باليوم الحالي —
 * نقطة بداية معقولة يقدر المستخدم يعدّلها بحرية بعد كده من واجهة الاختيار */
export function defaultRangeForPeriodType(type: StatsPeriodType, reference: Date = new Date()): { start: Date; end: Date } {
  const end = new Date(reference);
  const start = new Date(reference);
  switch (type) {
    case 'week':
      start.setDate(start.getDate() - 6);
      break;
    case 'month':
      start.setDate(start.getDate() - 29);
      break;
    case 'quarter':
      start.setDate(start.getDate() - 89);
      break;
    default:
      // day: نفس اليوم فى البداية والنهاية
      break;
  }
  return { start, end };
}

/** تسمية بشرية لنطاق الفترة المختارة — تُستخدم فى عناوين الواجهة */
export function periodRangeLabel(type: StatsPeriodType, start: Date, end: Date): string {
  if (type === 'day' || formatDateInput(start) === formatDateInput(end)) {
    return `${formatReportDate(start)} (${formatReportDay(start)})`;
  }
  return `من ${formatReportDate(start)} إلى ${formatReportDate(end)}`;
}
