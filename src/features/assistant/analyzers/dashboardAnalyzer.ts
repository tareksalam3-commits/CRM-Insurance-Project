import { supabase, User } from '../../../lib/supabase';
import { startOfMonth, startOfDay, endOfDay, format } from 'date-fns';
import { dalRead } from '../../../lib/dataAccessLayer';
import type { AssistantAnswer } from '../types';
import { formatCurrency } from '../helpers/formatters';
import { getScopedUserIds, getScopedTeamAchievement, getSubtreeUserIds, getSubtreeScopedPayments } from '../helpers/scopeHelpers';

/** ملخص أداء اليوم */
export async function getTodaySummary(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');
  const todayStart = startOfDay(now).toISOString();
  const todayEnd = endOfDay(now).toISOString();

  interface TodaySummaryRaw {
    paymentsToday: any[];
    newPoliciesToday: any[];
    newCustomersToday: any[];
    dueToday: any[];
    overdue: any[];
  }

  const todayDateStr = format(now, 'yyyy-MM-dd');
  const raw = await dalRead<TodaySummaryRaw>(
    `assistant:todaySummary:${userIds.slice().sort().join(',')}:${todayDateStr}`,
    async () => {
      const [paymentsTodayRes, newPoliciesTodayRes, newCustomersTodayRes, dueTodayRes, overdueRes] =
        await Promise.all([
          supabase.rpc('assistant_scoped_payments', { p_paid_at_gte: todayStart, p_paid_at_lte: todayEnd }),
          supabase.rpc('assistant_scoped_policies', { p_created_from: todayStart, p_created_to: todayEnd }),
          supabase.rpc('assistant_scoped_customers', { p_created_from: todayStart, p_created_to: todayEnd }),
          supabase.rpc('assistant_scoped_installments', { p_status: 'pending', p_due_date: todayDateStr }),
          supabase.rpc('assistant_scoped_installments', { p_status: 'overdue' })
        ]);

      if (paymentsTodayRes.error) throw paymentsTodayRes.error;
      if (newPoliciesTodayRes.error) throw newPoliciesTodayRes.error;
      if (newCustomersTodayRes.error) throw newCustomersTodayRes.error;
      if (dueTodayRes.error) throw dueTodayRes.error;
      if (overdueRes.error) throw overdueRes.error;

      return {
        paymentsToday: paymentsTodayRes.data || [],
        newPoliciesToday: newPoliciesTodayRes.data || [],
        newCustomersToday: newCustomersTodayRes.data || [],
        dueToday: dueTodayRes.data || [],
        overdue: overdueRes.data || [],
      };
    },
    {
      emptyValue: {
        paymentsToday: [],
        newPoliciesToday: [],
        newCustomersToday: [],
        dueToday: [],
        overdue: [],
      },
    },
  ).then((r) => r.data);

  // نطاق التحليل بيتطبّق فعلياً جوه القاعدة (assistant_scoped_*)، فمفيش
  // داعي لأي فلترة إضافية هنا على userIds.
  const paymentsToday = raw.paymentsToday;
  const dueTodayFiltered = raw.dueToday;
  const overdueFiltered = raw.overdue;
  const overdueCustomerIds = new Set(overdueFiltered.map((i: any) => i.customer_id));

  // نسبة تحقيق الهدف لازم تتحسب بنفس نطاق ومنطق لوحة التحكم بالظبط (subtree
  // + هدف المستخدم الفردي)، مش نطاق التحليل الأوسع المستخدم في باقي أرقام
  // الملخص ده - عشان الرقم يطابق اللي المستخدم شايفه فعليًا في التطبيق.
  const subtreeIds = await getSubtreeUserIds(user);
  const subtreePayments = await getSubtreeScopedPayments(subtreeIds, monthStartStr);
  const subtreeAchieved = subtreePayments.reduce((s, p) => s + p.amount, 0);
  const monthTarget = Number(user.target || 0);
  const achievementRate = monthTarget > 0 ? Math.round((subtreeAchieved / monthTarget) * 100) : 0;

  const productionToday = paymentsToday
    .filter((p: any) => p.is_first)
    .reduce((s: number, p: any) => s + Number(p.amount), 0);
  const collectionToday = paymentsToday
    .filter((p: any) => !p.is_first)
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
      `وثائق جديدة اليوم: ${raw.newPoliciesToday.length}`,
      `عملاء جدد اليوم: ${raw.newCustomersToday.length}`,
      `أفضل وكيل: ${topAgent ? topAgent.name : 'لا يوجد'}`,
      `أفضل رئيس مجموعة: ${topGroupLeader ? topGroupLeader.name : 'لا يوجد'}`,
      `أقساط مستحقة اليوم: ${dueTodayFiltered.length}`,
      `عملاء متأخرون: ${overdueCustomerIds.size}`
    ]
  };
}

/** ملخص الفرع الكامل (يعني: ملخص نطاق التحليل الكامل الخاص بالمستخدم) */
export async function getBranchSummary(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const monthStartStr = format(startOfMonth(new Date()), 'yyyy-MM-dd');

  const branchRaw = await dalRead(
    `assistant:branchSummary:${userIds.slice().sort().join(',')}:${monthStartStr}`,
    async () => {
      const [customersRes, policiesRes, paymentsRes] = await Promise.all([
        supabase.rpc('assistant_scoped_customers'),
        supabase.rpc('assistant_scoped_policies'),
        supabase.rpc('assistant_scoped_payments', { p_payment_month: monthStartStr })
      ]);
      if (customersRes.error) throw customersRes.error;
      if (policiesRes.error) throw policiesRes.error;
      if (paymentsRes.error) throw paymentsRes.error;
      return {
        customersCount: (customersRes.data || []).length,
        policies: policiesRes.data || [],
        payments: paymentsRes.data || [],
      };
    },
    { emptyValue: { customersCount: 0, policies: [] as any[], payments: [] as any[] } },
  );

  const policies = branchRaw.data.policies;
  const activePolicies = policies.filter((p: any) => p.status === 'active').length;
  const payments = branchRaw.data.payments;
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

  const dueTodayRaw = await dalRead(
    `assistant:dailyTip:dueToday:${userIds.slice().sort().join(',')}:${todayStr}`,
    async () => {
      const { data, error } = await supabase.rpc('assistant_scoped_installments', {
        p_status: 'pending',
        p_due_date: todayStr,
      });
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );

  // "المحقق" و"الهدف" هنا لازم يتحسبوا بنفس نطاق لوحة التحكم بالظبط (subtree
  // + هدف فردي)، مش نطاق التحليل الأوسع - نفس السبب الموجود في getTodaySummary.
  const subtreeIds = await getSubtreeUserIds(user);
  const payments = await getSubtreeScopedPayments(subtreeIds, monthStartStr);
  const collection = payments.filter((p) => !p.isFirst).reduce((s, p) => s + p.amount, 0);
  const achieved = payments.reduce((s, p) => s + p.amount, 0);
  const target = Number(user.target || 0);
  const dueTodayCount = dueTodayRaw.data.length;

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
