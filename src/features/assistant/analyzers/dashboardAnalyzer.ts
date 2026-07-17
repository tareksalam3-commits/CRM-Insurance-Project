import { supabase, User } from '../../../lib/supabase';
import { startOfMonth, startOfDay, endOfDay, format } from 'date-fns';
import { dalRead } from '../../../lib/dataAccessLayer';
import type { AssistantAnswer } from '../types';
import { formatCurrency } from '../helpers/formatters';
import { getScopedUserIds, getScopedTeamAchievement } from '../helpers/scopeHelpers';

/** ملخص أداء اليوم */
export async function getTodaySummary(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');
  const todayStart = startOfDay(now).toISOString();
  const todayEnd = endOfDay(now).toISOString();

  interface TodaySummaryRaw {
    paymentsMonth: any[];
    paymentsToday: any[];
    newPoliciesToday: { data: any[]; count: number | null };
    newCustomersToday: { data: any[]; count: number | null };
    dueToday: any[];
    overdue: any[];
  }

  const todayDateStr = format(now, 'yyyy-MM-dd');
  const raw = await dalRead<TodaySummaryRaw>(
    `assistant:todaySummary:${userIds.slice().sort().join(',')}:${todayDateStr}`,
    async () => {
      const [paymentsMonthRes, paymentsTodayRes, newPoliciesTodayRes, newCustomersTodayRes, dueTodayRes, overdueRes] =
        await Promise.all([
          supabase
            .from('payments')
            .select('amount, is_cancelled, installment:installment_id(is_first, policy:policy_id(owner_id))')
            .eq('payment_month', monthStartStr)
            .eq('is_cancelled', false),
          supabase
            .from('payments')
            .select('amount, is_cancelled, paid_at, installment:installment_id(is_first, policy:policy_id(owner_id))')
            .eq('is_cancelled', false)
            .gte('paid_at', todayStart)
            .lte('paid_at', todayEnd),
          supabase
            .from('policies')
            .select('id, owner_id', { count: 'exact' })
            .in('owner_id', userIds)
            .gte('created_at', todayStart)
            .lte('created_at', todayEnd),
          supabase
            .from('customers')
            .select('id, owner_id', { count: 'exact' })
            .in('owner_id', userIds)
            .gte('created_at', todayStart)
            .lte('created_at', todayEnd),
          supabase
            .from('installments')
            .select('id, amount, status, policy:policy_id(owner_id)')
            .eq('status', 'pending')
            .eq('due_date', todayDateStr),
          supabase
            .from('installments')
            .select('id, policy:policy_id(owner_id, customer_id)')
            .eq('status', 'overdue')
        ]);

      if (paymentsMonthRes.error) throw paymentsMonthRes.error;
      if (paymentsTodayRes.error) throw paymentsTodayRes.error;
      if (newPoliciesTodayRes.error) throw newPoliciesTodayRes.error;
      if (newCustomersTodayRes.error) throw newCustomersTodayRes.error;
      if (dueTodayRes.error) throw dueTodayRes.error;
      if (overdueRes.error) throw overdueRes.error;

      return {
        paymentsMonth: paymentsMonthRes.data || [],
        paymentsToday: paymentsTodayRes.data || [],
        newPoliciesToday: { data: newPoliciesTodayRes.data || [], count: newPoliciesTodayRes.count },
        newCustomersToday: { data: newCustomersTodayRes.data || [], count: newCustomersTodayRes.count },
        dueToday: dueTodayRes.data || [],
        overdue: overdueRes.data || [],
      };
    },
    {
      emptyValue: {
        paymentsMonth: [],
        paymentsToday: [],
        newPoliciesToday: { data: [], count: 0 },
        newCustomersToday: { data: [], count: 0 },
        dueToday: [],
        overdue: [],
      },
    },
  ).then((r) => r.data);

  const newPoliciesTodayRes = raw.newPoliciesToday;
  const newCustomersTodayRes = raw.newCustomersToday;

  const paymentsMonth = raw.paymentsMonth.filter((p: any) =>
    userIds.includes(p.installment?.policy?.owner_id)
  );
  const paymentsToday = raw.paymentsToday.filter((p: any) =>
    userIds.includes(p.installment?.policy?.owner_id)
  );
  const dueTodayFiltered = raw.dueToday.filter((i: any) =>
    userIds.includes(i.policy?.owner_id)
  );
  const overdueFiltered = raw.overdue.filter((i: any) =>
    userIds.includes(i.policy?.owner_id)
  );
  const overdueCustomerIds = new Set(overdueFiltered.map((i: any) => i.policy?.customer_id));

  const monthAchieved = paymentsMonth.reduce((s: number, p: any) => s + Number(p.amount), 0);
  const monthTarget = Number(user.target || 0);
  const achievementRate = monthTarget > 0 ? Math.round((monthAchieved / monthTarget) * 100) : 0;

  const productionToday = paymentsToday
    .filter((p: any) => p.installment?.is_first)
    .reduce((s: number, p: any) => s + Number(p.amount), 0);
  const collectionToday = paymentsToday
    .filter((p: any) => !p.installment?.is_first)
    .reduce((s: number, p: any) => s + Number(p.amount), 0);

  const team = await getScopedTeamAchievement(userIds);
  const agentsOnly = team.filter((t) => t.role === 'agent' || t.role === 'premium_agent');
  const groupLeadersOnly = team.filter((t) => t.role === 'group_leader');

  const topAgent = [...agentsOnly].sort((a, b) => b.achieved - a.achieved)[0];
  const topGroupLeader = [...groupLeadersOnly].sort((a, b) => b.achieved - a.achieved)[0];

  return {
    title: '📊 ملخص أداء اليوم',
    lines: [
      `نسبة تحقيق الهدف: ${achievementRate}%`,
      `إنتاج اليوم: ${formatCurrency(productionToday)}`,
      `تحصيل اليوم: ${formatCurrency(collectionToday)}`,
      `وثائق جديدة اليوم: ${newPoliciesTodayRes.count ?? 0}`,
      `عملاء جدد اليوم: ${newCustomersTodayRes.count ?? 0}`,
      `أفضل وكيل: ${topAgent ? topAgent.name : 'لا يوجد'}`,
      `أفضل رئيس مجموعة: ${topGroupLeader ? topGroupLeader.name : 'لا يوجد'}`,
      `أقساط مستحقة اليوم: ${dueTodayFiltered.length}`,
      `عملاء متأخرون: ${overdueCustomerIds.size}`
    ]
  };
}

/** ملخص الفرع الكامل */
export async function getBranchSummary(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const monthStartStr = format(startOfMonth(new Date()), 'yyyy-MM-dd');

  const branchRaw = await dalRead(
    `assistant:branchSummary:${userIds.slice().sort().join(',')}:${monthStartStr}`,
    async () => {
      const [customersRes, policiesRes, paymentsRes] = await Promise.all([
        supabase.from('customers').select('id', { count: 'exact', head: true }).in('owner_id', userIds),
        supabase.from('policies').select('id, status').in('owner_id', userIds),
        supabase
          .from('payments')
          .select('amount, is_cancelled, installment:installment_id(policy:policy_id(owner_id))')
          .eq('payment_month', monthStartStr)
          .eq('is_cancelled', false)
      ]);
      if (customersRes.error) throw customersRes.error;
      if (policiesRes.error) throw policiesRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      return {
        customersCount: customersRes.count ?? 0,
        policies: policiesRes.data || [],
        payments: paymentsRes.data || [],
      };
    },
    { emptyValue: { customersCount: 0, policies: [] as any[], payments: [] as any[] } },
  );

  const policies = branchRaw.data.policies;
  const activePolicies = policies.filter((p: any) => p.status === 'active').length;
  const payments = branchRaw.data.payments.filter((p: any) => userIds.includes(p.installment?.policy?.owner_id));
  const totalCollected = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);

  return {
    title: '📋 ملخص الفرع',
    lines: [
      `عدد العملاء: ${branchRaw.data.customersCount}`,
      `عدد الوثائق: ${policies.length} (منها ${activePolicies} نشطة)`,
      `إجمالي التحصيل هذا الشهر: ${formatCurrency(totalCollected)}`
    ]
  };
}

/**
 * نصيحة اليوم - قواعد داخلية بسيطة مبنية على بيانات النظام الفعلية،
 * بدون أي استخدام لخدمات ذكاء اصطناعي خارجية
 */
export async function getDailyTip(user: User): Promise<string | null> {
  const userIds = await getScopedUserIds(user);
  const monthStartStr = format(startOfMonth(new Date()), 'yyyy-MM-dd');
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const tipRaw = await dalRead(
    `assistant:dailyTip:${userIds.slice().sort().join(',')}:${monthStartStr}:${todayStr}`,
    async () => {
      const [paymentsRes, dueTodayRes] = await Promise.all([
        supabase
          .from('payments')
          .select('amount, is_cancelled, installment:installment_id(is_first, policy:policy_id(owner_id))')
          .eq('payment_month', monthStartStr)
          .eq('is_cancelled', false),
        supabase
          .from('installments')
          .select('id, policy:policy_id(owner_id)')
          .eq('status', 'pending')
          .eq('due_date', todayStr)
      ]);
      if (paymentsRes.error) throw paymentsRes.error;
      if (dueTodayRes.error) throw dueTodayRes.error;
      return { payments: paymentsRes.data || [], dueToday: dueTodayRes.data || [] };
    },
    { emptyValue: { payments: [] as any[], dueToday: [] as any[] } },
  );

  const payments = tipRaw.data.payments.filter((p: any) => userIds.includes(p.installment?.policy?.owner_id));
  const collection = payments.filter((p: any) => !p.installment?.is_first).reduce((s: number, p: any) => s + Number(p.amount), 0);
  const achieved = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
  const target = Number(user.target || 0);
  const dueTodayCount = tipRaw.data.dueToday.filter((i: any) => userIds.includes(i.policy?.owner_id)).length;

  const rate = target > 0 ? achieved / target : 0;
  const collectionShare = achieved > 0 ? collection / achieved : 0;

  // ترتيب أولوية النصائح: الأهم أولًا
  if (target > 0 && rate >= 0.9 && rate < 1) {
    return 'يتبقى مبلغ بسيط لتحقيق الهدف الشهري.';
  }
  if (target > 0 && collectionShare < 0.4 && achieved > 0) {
    return 'ركز اليوم على التحصيل لأن نسبته أقل من المستهدف.';
  }
  if (dueTodayCount > 0) {
    return `يوجد ${dueTodayCount} من العملاء مستحق عليهم أقساط اليوم.`;
  }
  if (target > 0 && rate === 0) {
    return 'لم يتم تسجيل أي تحصيل بعد هذا الشهر، ابدأ بمراجعة عملائك.';
  }

  return null;
}
