import { supabase } from '../../../lib/supabase';
import { format } from 'date-fns';
import { dalRead } from '../../../lib/dataAccessLayer';
import { fetchUserSubtreeIdsBranchAware } from '../../../lib/branchHierarchy';
import { fetchDailyStatsForUsers } from './activityTargetsService';
import { aggregateEntries } from '../../DailyReports/services/dailyStatsService';
import { computeActivityScore, computeFinalScore, type ActivityTargets, type ActivityScoreResult } from '../business/performanceScoreCalculator';

// ===================================
// كل دوال القراءة هنا بقت تمر من dalRead (طبقة الوصول الموحدة للبيانات):
// أونلاين بترجع بيانات حقيقية وتحفظها فى الكاش، وأوفلاين (أو عند فشل
// الشبكة/تعليقها) بترجع آخر نسخة محفوظة أو شكل فاضٍ متوافق مع النوع بدل
// ما تعلّق الصفحة فى Loading أو تنهار. راجع lib/dataAccessLayer.ts.
// ===================================

// نطاق المستخدم (هو + كل من تحته)، فى نطاق الفرع الحالي المختار لو موجود
// (BranchProvider العام) — بترجع لنفس السلوك القديم (عابر للفروع) لو
// branchId فاضي، راجع lib/branchHierarchy.ts لتفاصيل التوافق مع الخلف.
export async function fetchUserSubtreeIds(userId: string, branchId: string | null = null): Promise<string[]> {
  return fetchUserSubtreeIdsBranchAware('reports', userId, branchId);
}

export async function fetchCustomersInRange(userIds: string[], start: Date, end: Date) {
  const result = await dalRead(
    `reports:customersInRange:${userIds.slice().sort().join(',')}:${start.toISOString()}:${end.toISOString()}`,
    async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, created_at')
        .in('owner_id', userIds)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );
  return result.data;
}

export async function fetchPoliciesForOwners(userIds: string[]) {
  const result = await dalRead(
    `reports:policiesForOwners:${userIds.slice().sort().join(',')}`,
    async () => {
      const { data, error } = await supabase
        .from('policies')
        .select('id, policy_number, status, policy_type, start_date, customer:customer_id(name), owner:owner_id(name)')
        .in('owner_id', userIds)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );
  return result.data;
}

export async function fetchPaymentsInRange(start: Date, end: Date) {
  const result = await dalRead(
    `reports:paymentsInRange:${format(start, 'yyyy-MM-dd')}:${format(end, 'yyyy-MM-dd')}`,
    async () => {
      const { data, error } = await supabase
        .from('payments')
        .select(
          'amount, payment_month, installment:installment_id(is_first, policy:policy_id(owner_id, policy_number, customer:customer_id(name), owner:owner_id(name)))'
        )
        .gte('payment_month', format(start, 'yyyy-MM-dd'))
        .lte('payment_month', format(end, 'yyyy-MM-dd'))
        .eq('is_cancelled', false);
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );
  return result.data;
}

export async function fetchAllInstallmentsWithPolicy() {
  const result = await dalRead(
    `reports:allInstallmentsWithPolicy`,
    async () => {
      const { data, error } = await supabase
        .from('installments')
        .select('id, amount, due_date, status, policy:policy_id(owner_id, policy_number, customer:customer_id(name))');
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );
  return result.data;
}

// الأقساط "المستحقة" خلال فترة معينة (بحسب تاريخ الاستحقاق due_date) —
// بغض النظر عن حالة السداد أو تاريخ اليوم الحالي، فلو الفترة المختارة فى
// المستقبل هترجع الأقساط المستحقة فيها أصلاً (والمسدد منها هيبقى صفر
// طبيعياً لأنه لسه معندهاش مدفوعات فى جدول payments).
// includeFirst=false (افتراضي، تحصيل الأقساط الدورية فقط): يستبعد أول قسط
// (إنتاج جديد). includeFirst=true (الإجمالي غير المتفصل): يشمل الكل
export async function fetchInstallmentsDueInRange(userIds: string[], start: Date, end: Date, includeFirst = false) {
  const result = await dalRead(
    `reports:installmentsDueInRange:${includeFirst ? 'all' : 'recurring'}:${userIds.slice().sort().join(',')}:${format(start, 'yyyy-MM-dd')}:${format(end, 'yyyy-MM-dd')}`,
    async () => {
      const { data, error } = await supabase
        .from('installments')
        .select(
          'id, amount, due_date, is_first, status, policy:policy_id(owner_id, policy_number, customer:customer_id(name), owner:owner_id(name))'
        )
        .gte('due_date', format(start, 'yyyy-MM-dd'))
        .lte('due_date', format(end, 'yyyy-MM-dd'));
      if (error) throw error;
      return (data || []).filter((i: any) => userIds.includes(i.policy?.owner_id) && (includeFirst || !i.is_first));
    },
    { emptyValue: [] as any[] },
  );
  return result.data;
}

export async function fetchAgentsForReport(userIds: string[]) {
  const result = await dalRead(
    `reports:agentsForReport:${userIds.slice().sort().join(',')}`,
    async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, target')
        .in('id', userIds)
        .in('role', ['agent', 'premium_agent'])
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );
  return result.data;
}

export async function fetchSimplePaymentsInRange(start: Date, end: Date) {
  const result = await dalRead(
    `reports:simplePaymentsInRange:${format(start, 'yyyy-MM-dd')}:${format(end, 'yyyy-MM-dd')}`,
    async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('amount, installment:installment_id(policy:policy_id(owner_id))')
        .gte('payment_month', format(start, 'yyyy-MM-dd'))
        .lte('payment_month', format(end, 'yyyy-MM-dd'))
        .eq('is_cancelled', false);
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );
  return result.data;
}

// كل المستخدمين النشطين ضمن مجموعة IDs معينة (بيستخدمها فلتر "اختيار مستخدم
// معين" فى صفحة التقارير — بيرجع الاسم والدرجة الوظيفية عشان تتعرض فى قائمة
// اختيار، بدل ما تكون مقصورة على أدوار بعينها زي fetchUsersByRole)
export async function fetchUsersInSubtree(userIds: string[]) {
  const result = await dalRead(
    `reports:usersInSubtree:${userIds.slice().sort().join(',')}`,
    async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, role')
        .in('id', userIds)
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );
  return result.data;
}

export async function fetchUsersByRole(userIds: string[], roles: string[]) {
  const result = await dalRead(
    `reports:usersByRole:${userIds.slice().sort().join(',')}:${roles.slice().sort().join(',')}`,
    async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, target')
        .in('id', userIds)
        .in('role', roles)
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );
  return result.data;
}

// نجيب أداء كل قائد (رئيس مجموعة/مراقب) ضمن قائمة معينة، بما فى ذلك "التقييم
// الشامل" المدمج لكامل نطاقه: نسبة تحقيق هدفه المالي (target الخاص به) +
// درجة نشاط كل الوكلاء تحته (إجمالي daily_agent_stats لنطاقه كله، بنفس
// معادلة تقييم الوكيل الفردي بالظبط — راجع performanceScoreCalculator).
// ملاحظة أداء: الاستعلام عن المدفوعات لنفس الفترة الزمنية كان يتكرر داخل كل تكرار
// من الحلقة رغم أنه نفس الاستعلام بالضبط في كل مرة — تم رفعه خارج الحلقة ليُنفَّذ مرة واحدة فقط
// (تحسين أداء بحت، لا يغيّر أي نتيجة لأن نفس بيانات المدفوعات تُستخدم للتصفية بعدها).
export async function fetchLeadersPerformance(
  leaders: { id: string; name: string; target?: number | null }[],
  start: Date,
  end: Date,
  branchId: string | null = null,
  activityTargets?: ActivityTargets,
): Promise<{
  id: string; name: string; count: number; achieved: number; target: number;
  finalScore: number; financialRate: number; activityScore: number | null; financialOnly: boolean;
  ratingLabel: string; ratingColorClass: string; activity: ActivityScoreResult;
}[]> {
  const payments = await fetchSimplePaymentsInRange(start, end);
  const performance: {
    id: string; name: string; count: number; achieved: number; target: number;
    finalScore: number; financialRate: number; activityScore: number | null; financialOnly: boolean;
    ratingLabel: string; ratingColorClass: string; activity: ActivityScoreResult;
  }[] = [];

  for (const leader of leaders) {
    const teamIds = await fetchUserSubtreeIds(leader.id, branchId);

    const achieved = payments
      .filter((p: any) => teamIds.includes(p.installment?.policy?.owner_id))
      .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

    const target = leader.target || 0;
    const financialRate = target > 0 ? Math.round((achieved / target) * 100) : 0;

    // نشاط كامل النطاق (هو + كل مرؤوسيه) خلال نفس الفترة — نفس معادلة
    // درجة الوكيل الفردي، لكن على إجمالي مجمّع بدل صف فردي
    const dailyStats = await fetchDailyStatsForUsers(teamIds, start, end);
    const activity = computeActivityScore(aggregateEntries(dailyStats), activityTargets);
    const scoreResult = computeFinalScore(financialRate, activity);

    performance.push({
      id: leader.id,
      name: leader.name,
      count: teamIds.length - 1,
      achieved,
      target,
      finalScore: scoreResult.finalScore,
      financialRate: scoreResult.financialRate,
      activityScore: scoreResult.activityScore,
      financialOnly: scoreResult.financialOnly,
      ratingLabel: scoreResult.ratingLabel,
      ratingColorClass: scoreResult.ratingColorClass,
      activity,
    });
  }

  return performance;
}
