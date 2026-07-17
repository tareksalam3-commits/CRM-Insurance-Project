import { format } from 'date-fns';
import { INSTALLMENTS_PER_METHOD, type RawYear1Payment, type RawYear2Payment } from '../services/commissionsService';
import type { CommissionRow, CommissionsSummary } from '../types';

// عمولة السنة الأولى = 2.4% من مبلغ التأمين، موزعة على عدد الأقساط
const YEAR1_RATE = 0.024;
// عمولة التجديد (من السنة الثانية فأكثر) = 4 لكل 1000 من مبلغ التأمين
// (0.004 من مبلغ التأمين)، موزعة على عدد الأقساط بنفس طريقة السداد —
// لو السداد سنوي فالعمولة كاملة مرة واحدة، ولو غير سنوي (شهري/ربع سنوي/
// نصف سنوي) توزّع بالتساوي على عدد الأقساط زي عمولة السنة الأولى بالظبط
const RENEWAL_RATE_PER_THOUSAND = 4 / 1000;

// قاعدة استحقاق العمولة:
// - سداد من يوم 1 إلى يوم 15 -> تستحق يوم 20 من نفس الشهر
// - سداد من يوم 16 حتى نهاية الشهر -> تستحق يوم 5 من الشهر التالي
function getCommissionDueDate(paidDate: Date): { dueDay: 5 | 20; dueMonth: string } {
  const day = paidDate.getDate();
  if (day <= 15) {
    return { dueDay: 20, dueMonth: format(paidDate, 'yyyy-MM') };
  }
  const nextMonth = new Date(paidDate.getFullYear(), paidDate.getMonth() + 1, 1);
  return { dueDay: 5, dueMonth: format(nextMonth, 'yyyy-MM') };
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
  const summary: CommissionsSummary = { totalMonth: 0, dueOn5: 0, dueOn20: 0 };
  for (const row of rows) {
    summary.totalMonth += row.amount;
    if (row.dueDay === 5) summary.dueOn5 += row.amount;
    else summary.dueOn20 += row.amount;
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
