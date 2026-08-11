import { format } from 'date-fns';
import type { RawYear1Payment, RawYear2Payment } from '../services/commissionsService';
import type { CommissionRow, CommissionsSummary } from '../types';

// عدد الأقساط حسب طريقة السداد. هذا ثابت حسابي فقط ولا يعتمد على خدمة
// البيانات، حتى تظل حاسبة العمولات معزولة وقابلة للاختبار.
const INSTALLMENTS_PER_METHOD: Record<string, number> = {
  monthly: 12,
  quarterly: 4,
  semi_annual: 2,
  annual: 1,
};

// عمولة السنة الأولى = 2.4% من مبلغ التأمين، موزعة على عدد الأقساط
const YEAR1_RATE = 0.024;
// عمولة التجديد (من السنة الثانية فأكثر) = 4 لكل 1000 من مبلغ التأمين
// (0.004 من مبلغ التأمين)، موزعة على عدد الأقساط بنفس طريقة السداد —
// لو السداد سنوي فالعمولة كاملة مرة واحدة، ولو غير سنوي (شهري/ربع سنوي/
// نصف سنوي) توزّع بالتساوي على عدد الأقساط زي عمولة السنة الأولى بالظبط
const RENEWAL_RATE_PER_THOUSAND = 4 / 1000;

// قاعدة صرف العمولة:
// - سداد من يوم 1 إلى يوم 15 -> يُصرف يوم 27 من نفس الشهر.
// - سداد من يوم 16 حتى نهاية الشهر -> يُصرف يوم 12 من الشهر التالي.
// بذلك يشمل صرف يوم 12 الفترة من 16 إلى نهاية الشهر السابق، وصرف يوم 27
// الفترة من 1 إلى 15 من الشهر الحالي.
function getCommissionDueDate(paidDate: Date): { dueDay: 12 | 27; dueMonth: string } {
  const day = paidDate.getDate();
  if (day <= 15) {
    return { dueDay: 27, dueMonth: format(paidDate, 'yyyy-MM') };
  }
  const nextMonth = new Date(paidDate.getFullYear(), paidDate.getMonth() + 1, 1);
  return { dueDay: 12, dueMonth: format(nextMonth, 'yyyy-MM') };
}

function last6(policyNumber: string): string {
  return policyNumber.length <= 6 ? policyNumber : policyNumber.slice(-6);
}

// تحويل تاريخ نصي (yyyy-MM-dd) إلى تاريخ محلي بدون فرق توقيت
function parseDateOnly(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export interface CommissionComputeResult {
  rows: CommissionRow[];
  missingSumAssuredCount: number;
}

export function computeCommissionRows(
  year1Payments: RawYear1Payment[],
  year2Payments: RawYear2Payment[],
  targetMonth: string // 'yyyy-MM'
): CommissionComputeResult {
  const rows: CommissionRow[] = [];
  let missingSumAssuredCount = 0;

  for (const payment of year1Payments) {
    const policy = payment.installment?.policy;
    if (!policy) continue;

    const installmentsCount = INSTALLMENTS_PER_METHOD[policy.payment_method];
    if (!installmentsCount) continue;

    const { dueDay, dueMonth } = getCommissionDueDate(new Date(payment.paid_at));
    if (dueMonth !== targetMonth) continue;

    // لا يمكن احتساب عمولة السنة الأولى بدون مبلغ التأمين (وثائق قديمة قد
    // لا يكون هذا الحقل مُدخلاً لها بعد) — نحتسبها كـ "غير محددة" بدل إخفائها
    // بصمت، عشان المستخدم يعرف إنه محتاج يكمّل بيانات الوثيقة
    if (!policy.sum_assured) {
      missingSumAssuredCount += 1;
      continue;
    }

    const commissionAmount = (Number(policy.sum_assured) * YEAR1_RATE) / installmentsCount;

    rows.push({
      id: `y1-${payment.id}`,
      customerName: policy.customer?.name || '-',
      policyLast6: last6(policy.policy_number),
      type: 'year1',
      amount: commissionAmount,
      dueDay,
      dueMonth,
    });
  }

  for (const payment of year2Payments) {
    const policy = payment.policy;
    if (!policy) continue;

    const paidDate = parseDateOnly(payment.payment_date);
    const { dueDay, dueMonth } = getCommissionDueDate(paidDate);
    if (dueMonth !== targetMonth) continue;

    const installmentsCount = INSTALLMENTS_PER_METHOD[policy.payment_method];
    if (!installmentsCount) continue;

    // نفس منطق عمولة السنة الأولى: لا يمكن الاحتساب بدون مبلغ التأمين
    if (!policy.sum_assured) {
      missingSumAssuredCount += 1;
      continue;
    }

    const commissionAmount = (Number(policy.sum_assured) * RENEWAL_RATE_PER_THOUSAND) / installmentsCount;

    rows.push({
      id: `y2-${payment.id}`,
      customerName: policy.customer?.name || '-',
      policyLast6: last6(policy.policy_number),
      type: 'renewal',
      amount: commissionAmount,
      dueDay,
      dueMonth,
    });
  }

  return { rows, missingSumAssuredCount };
}

export function computeSummary(rows: CommissionRow[]): CommissionsSummary {
  const summary: CommissionsSummary = { totalMonth: 0, dueOn12: 0, dueOn27: 0 };
  for (const row of rows) {
    summary.totalMonth += row.amount;
    if (row.dueDay === 12) summary.dueOn12 += row.amount;
    else summary.dueOn27 += row.amount;
  }
  return summary;
}

export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 0,
  }).format(amount);

export const COMMISSION_TYPE_LABELS: Record<CommissionRow['type'], string> = {
  year1: 'السنة الأولى',
  renewal: 'تجديد',
};
