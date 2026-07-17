import { supabase } from '../../../lib/supabase';
import { format } from 'date-fns';
import type { RawCancelledPolicy, BasicHierarchyUser } from '../types';
import { buildCancellationSummary } from '../business/cancellationCalculator';
import { dalRead } from '../../../lib/dataAccessLayer';

// ===================================
// كل دوال القراءة هنا بقت تمر من dalRead (طبقة الوصول الموحدة للبيانات):
// أونلاين بترجع بيانات حقيقية وتحفظها فى الكاش، وأوفلاين (أو عند فشل
// الشبكة/تعليقها) بترجع آخر نسخة محفوظة أو شكل فاضٍ متوافق مع النوع بدل
// ما تعلّق الصفحة فى Loading أو تنهار. راجع lib/dataAccessLayer.ts.
// ===================================

// نفس نمط باقي الصفحات: نطاق المستخدم (نفسه + كل من تحته في التسلسل الإداري)
export async function fetchUserSubtreeIds(userId: string): Promise<string[]> {
  const result = await dalRead(
    `cancellations:subtree:${userId}`,
    async () => {
      const { data: subtree, error } = await supabase.rpc('get_user_subtree', { user_id: userId });
      if (error) throw error;
      return (subtree as string[]) || [userId];
    },
    { emptyValue: [userId] },
  );
  return result.data;
}

export async function fetchSubtreeUsers(userIds: string[]): Promise<BasicHierarchyUser[]> {
  const result = await dalRead(
    `cancellations:subtreeUsers:${userIds.slice().sort().join(',')}`,
    async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, role, manager_id')
        .in('id', userIds);
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as BasicHierarchyUser[] },
  );
  return result.data;
}

// الوثائق الملغاة خلال الفترة (من أول يناير حتى نهاية الشهر الحالي)، ضمن
// نطاق المستخدم فقط. RLS على جدول policies يقيّد النتائج تلقائياً بنفس
// النطاق أيضاً، فالفلترة بـ owner_id هنا مجرد اتساق مع باقي الصفحات.
export async function fetchCancelledPoliciesInYear(
  userIds: string[],
  yearStart: Date,
  periodEnd: Date,
): Promise<RawCancelledPolicy[]> {
  const result = await dalRead(
    `cancellations:cancelledInYear:${userIds.slice().sort().join(',')}:${yearStart.toISOString()}:${periodEnd.toISOString()}`,
    async () => {
      const { data, error } = await supabase
        .from('policies')
        .select('id, policy_number, customer_id, owner_id, policy_type, start_date, premium_amount, cancelled_at, customer:customer_id(name)')
        .in('owner_id', userIds)
        .eq('status', 'cancelled')
        .not('cancelled_at', 'is', null)
        .gte('cancelled_at', yearStart.toISOString())
        .lte('cancelled_at', periodEnd.toISOString());
      if (error) throw error;
      return (data as unknown as RawCancelledPolicy[]) || [];
    },
    { emptyValue: [] as RawCancelledPolicy[] },
  );
  return result.data;
}

// إجمالي الأقساط المسددة لكل الوثائق (المقام) — نفس نمط باقي التقارير:
// نجيب الدفعات مع بيانات المالك المضمّنة (embed) ثم نفلتر بالـ owner_id
// على مستوى العميل لأن payments/year2_payments لا تحتوي owner_id مباشرة.
const EMPTY_COLLECTED_IN_PERIOD = { year1Payments: [] as any[], year2Payments: [] as any[] };

export async function fetchAllCollectedInPeriod(yearStartStr: string, periodEndStr: string) {
  const result = await dalRead(
    `cancellations:allCollected:${yearStartStr}:${periodEndStr}`,
    async () => {
      const [year1Res, year2Res] = await Promise.all([
        supabase
          .from('payments')
          .select('amount, installment:installment_id(policy:policy_id(owner_id))')
          .eq('is_cancelled', false)
          .gte('payment_month', yearStartStr)
          .lte('payment_month', periodEndStr),
        supabase
          .from('year2_payments')
          .select('amount, policy:policy_id(owner_id)')
          .eq('is_cancelled', false)
          .gte('payment_month', yearStartStr)
          .lte('payment_month', periodEndStr),
      ]);

      if (year1Res.error) throw year1Res.error;
      if (year2Res.error) throw year2Res.error;

      return {
        year1Payments: year1Res.data || [],
        year2Payments: year2Res.data || [],
      };
    },
    { emptyValue: EMPTY_COLLECTED_IN_PERIOD },
  );
  return result.data;
}

// إجمالي الأقساط المسددة قبل الإلغاء لكل وثيقة من الوثائق المؤهلة (البسط) —
// نستخدم فلترة مباشرة بالـ policy_id (بدون تجميع/تخزين، مجرد جلب حي من القاعدة)
const EMPTY_PAID_AMOUNTS = {
  year1Payments: [] as { amount: number; policy_id: string }[],
  year2Payments: [] as { amount: number; policy_id: string }[],
};

export async function fetchPaidAmountsForPolicies(policyIds: string[]) {
  if (policyIds.length === 0) {
    return { year1Payments: [] as { amount: number; policy_id: string }[], year2Payments: [] as { amount: number; policy_id: string }[] };
  }

  const result = await dalRead(
    `cancellations:paidAmounts:${policyIds.slice().sort().join(',')}`,
    async () => {
      const [installmentsRes, year2Res] = await Promise.all([
        supabase
          .from('installments')
          .select('id, policy_id')
          .in('policy_id', policyIds),
        supabase
          .from('year2_payments')
          .select('amount, policy_id')
          .eq('is_cancelled', false)
          .in('policy_id', policyIds),
      ]);

      if (installmentsRes.error) throw installmentsRes.error;
      if (year2Res.error) throw year2Res.error;

      const installments = installmentsRes.data || [];
      const installmentIds = installments.map((i) => i.id);

      let year1Payments: { amount: number; installment_id: string }[] = [];
      if (installmentIds.length > 0) {
        const { data, error } = await supabase
          .from('payments')
          .select('amount, installment_id')
          .eq('is_cancelled', false)
          .in('installment_id', installmentIds);
        if (error) throw error;
        year1Payments = data || [];
      }

      // نحوّل year1Payments (المرتبطة بـ installment_id) لتصبح مرتبطة بـ policy_id مباشرة
      const instToPolicy = new Map(installments.map((i) => [i.id, i.policy_id]));
      const year1WithPolicy = year1Payments
        .map((p) => ({ amount: Number(p.amount), policy_id: instToPolicy.get(p.installment_id) || '' }))
        .filter((p) => p.policy_id);

      const year2WithPolicy = (year2Res.data || []).map((p) => ({ amount: Number(p.amount), policy_id: p.policy_id }));

      return { year1Payments: year1WithPolicy, year2Payments: year2WithPolicy };
    },
    { emptyValue: EMPTY_PAID_AMOUNTS },
  );
  return result.data;
}

export const getYearStart = () => new Date(new Date().getFullYear(), 0, 1);
export const getPeriodEndStr = (periodEnd: Date) => format(periodEnd, 'yyyy-MM-dd');
export const getYearStartStr = (yearStart: Date) => format(yearStart, 'yyyy-MM-dd');

// دالة تجميعية واحدة (جلب + حساب) تُستخدم من Dashboard وReports وصفحة تفاصيل
// الإلغاءات، حتى لا يتكرر نفس التسلسل في أكثر من مكان.
export async function loadCancellationSummary(viewer: { id: string; name: string; role: string }) {
  const now = new Date();
  const yearStart = getYearStart();
  const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  const yearStartStr = getYearStartStr(yearStart);
  const periodEndStr = getPeriodEndStr(periodEnd);

  const userIds = await fetchUserSubtreeIds(viewer.id);

  const [cancelledPolicies, users, { year1Payments: allYear1Payments, year2Payments: allYear2Payments }] =
    await Promise.all([
      fetchCancelledPoliciesInYear(userIds, yearStart, periodEnd),
      fetchSubtreeUsers(userIds),
      fetchAllCollectedInPeriod(yearStartStr, periodEndStr),
    ]);

  const eligiblePolicyIds = cancelledPolicies
    .filter((p) => p.cancelled_at)
    .map((p) => p.id);

  const paidForEligiblePolicies = await fetchPaidAmountsForPolicies(eligiblePolicyIds);

  return buildCancellationSummary({
    year: now.getFullYear(),
    cancelledPolicies,
    users,
    viewer,
    paidForEligiblePolicies,
    allYear1Payments,
    allYear2Payments,
    userIds,
  });
}
