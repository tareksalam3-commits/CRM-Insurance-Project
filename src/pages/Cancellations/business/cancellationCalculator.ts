import { differenceInMonths } from 'date-fns';
import type {
  RawCancelledPolicy, BasicHierarchyUser, CancellationDetailRow, CancellationSummary,
} from '../types';

// حد أهلية الإلغاء لدخول المؤشر: أقل من 18 شهر من تاريخ بداية التأمين
const ELIGIBILITY_MONTHS_THRESHOLD = 18;

export interface RawPaymentWithPolicy {
  amount: number;
  policy_id: string;
}

export interface RawPaymentWithOwner {
  amount: number;
  installment?: { policy?: { owner_id: string } | null } | null;
}

export interface RawYear2WithOwner {
  amount: number;
  policy?: { owner_id: string } | null;
}

// يحسب عدد الأشهر الكاملة بين تاريخ البداية وتاريخ الإلغاء
export function computeMonthsElapsed(startDate: string, cancelledAt: string): number {
  return differenceInMonths(new Date(cancelledAt), new Date(startDate));
}

// هل الوثيقة مؤهلة لدخول حساب نسبة الإلغاءات (أُلغيت قبل مرور 18 شهراً)؟
export function isEligibleForCancellationRate(startDate: string, cancelledAt: string): boolean {
  return computeMonthsElapsed(startDate, cancelledAt) < ELIGIBILITY_MONTHS_THRESHOLD;
}

// المقام: إجمالي كل الأقساط المسددة (سنة أولى + سنة ثانية) ضمن نطاق المستخدم
export function computeTotalCollected(
  year1Payments: RawPaymentWithOwner[],
  year2Payments: RawYear2WithOwner[],
  userIds: string[],
): number {
  const y1 = year1Payments.reduce((sum, p) => {
    const ownerId = p.installment?.policy?.owner_id;
    return ownerId && userIds.includes(ownerId) ? sum + Number(p.amount) : sum;
  }, 0);

  const y2 = year2Payments.reduce((sum, p) => {
    const ownerId = p.policy?.owner_id;
    return ownerId && userIds.includes(ownerId) ? sum + Number(p.amount) : sum;
  }, 0);

  return y1 + y2;
}

// يبني اسم كل مستوى إداري (رئيس مجموعة / مراقب / مراقب عام) لوكيل معيّن
// عن طريق تتبّع سلسلة manager_id صعوداً. لو السلسلة خرجت من النطاق المسموح
// للمستخدم الحالي (مثلاً هو نفسه رئيس مجموعة)، يُستخدم اسم المستخدم نفسه
// كقيمة افتراضية لمستواه بدل ترك الحقل فارغاً.
export function resolveHierarchyNames(
  ownerId: string,
  usersMap: Map<string, BasicHierarchyUser>,
  viewer: { id: string; name: string; role: string },
): { agentName: string; groupLeaderName: string; supervisorName: string; generalSupervisorName: string } {
  const owner = usersMap.get(ownerId);
  const agentName = owner?.name || '';

  let groupLeaderName = '';
  let supervisorName = '';
  let generalSupervisorName = '';

  let cur = owner?.manager_id || null;
  while (cur) {
    const m = usersMap.get(cur);
    if (!m) break;
    if (!groupLeaderName && m.role === 'group_leader') groupLeaderName = m.name;
    if (!supervisorName && m.role === 'supervisor') supervisorName = m.name;
    if (!generalSupervisorName && m.role === 'general_supervisor') generalSupervisorName = m.name;
    cur = m.manager_id;
  }

  if (!groupLeaderName && viewer.role === 'group_leader') groupLeaderName = viewer.name;
  if (!supervisorName && viewer.role === 'supervisor') supervisorName = viewer.name;
  if (!generalSupervisorName && viewer.role === 'general_supervisor') generalSupervisorName = viewer.name;

  return { agentName, groupLeaderName, supervisorName, generalSupervisorName };
}

export interface BuildCancellationSummaryParams {
  year: number;
  cancelledPolicies: RawCancelledPolicy[];
  users: BasicHierarchyUser[];
  viewer: { id: string; name: string; role: string };
  paidForEligiblePolicies: { year1Payments: RawPaymentWithPolicy[]; year2Payments: RawPaymentWithPolicy[] };
  allYear1Payments: RawPaymentWithOwner[];
  allYear2Payments: RawYear2WithOwner[];
  userIds: string[];
}

export function buildCancellationSummary({
  year, cancelledPolicies, users, viewer, paidForEligiblePolicies, allYear1Payments, allYear2Payments, userIds,
}: BuildCancellationSummaryParams): CancellationSummary {
  const usersMap = new Map<string, BasicHierarchyUser>(users.map((u) => [u.id, u]));

  // فقط الوثائق التي أُلغيت قبل مرور 18 شهراً هي التي تدخل الحساب
  const eligiblePolicies = cancelledPolicies.filter((p) => isEligibleForCancellationRate(p.start_date, p.cancelled_at));

  // إجمالي ما تم سداده لكل وثيقة (سنة أولى + سنة ثانية) قبل إلغائها
  const paidByPolicy = new Map<string, number>();
  for (const p of paidForEligiblePolicies.year1Payments) {
    paidByPolicy.set(p.policy_id, (paidByPolicy.get(p.policy_id) || 0) + Number(p.amount));
  }
  for (const p of paidForEligiblePolicies.year2Payments) {
    paidByPolicy.set(p.policy_id, (paidByPolicy.get(p.policy_id) || 0) + Number(p.amount));
  }

  const rows: CancellationDetailRow[] = eligiblePolicies.map((policy) => {
    const { agentName, groupLeaderName, supervisorName, generalSupervisorName } =
      resolveHierarchyNames(policy.owner_id, usersMap, viewer);

    return {
      policyId: policy.id,
      customerName: policy.customer?.name || '',
      policyNumberLast6: (policy.policy_number || '').slice(-6),
      agentName,
      groupLeaderName,
      supervisorName,
      generalSupervisorName,
      startDate: policy.start_date,
      cancelledDate: policy.cancelled_at,
      monthsElapsed: computeMonthsElapsed(policy.start_date, policy.cancelled_at),
      totalPaidBeforeCancellation: paidByPolicy.get(policy.id) || 0,
      premiumAmount: Number(policy.premium_amount),
      policyType: policy.policy_type,
    };
  });

  const cancelledValue = rows.reduce((sum, r) => sum + r.totalPaidBeforeCancellation, 0);
  const totalCollected = computeTotalCollected(allYear1Payments, allYear2Payments, userIds);
  const cancellationRate = totalCollected > 0 ? (cancelledValue / totalCollected) * 100 : 0;

  return {
    year,
    cancellationRate: Math.round(cancellationRate * 100) / 100,
    cancelledValue,
    totalCollected,
    rows: rows.sort((a, b) => b.cancelledDate.localeCompare(a.cancelledDate)),
  };
}
