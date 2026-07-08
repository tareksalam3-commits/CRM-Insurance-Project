import { supabase, User, UserRole } from '../../lib/supabase';
import { startOfMonth, startOfDay, endOfDay, format } from 'date-fns';

// ==============================
// أدوات مساعدة عامة
// ==============================

async function getScopedUserIds(user: User): Promise<string[]> {
  const { data } = await supabase.rpc('get_user_subtree', { user_id: user.id });
  return data || [user.id];
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

export interface AgentRow {
  id: string;
  name: string;
  role: UserRole;
  achieved: number;
  target: number;
}

/**
 * بيرجع كل المستخدمين النشطين في نطاق رؤية المستخدم الحالي، مع إجمالي
 * التحصيل/الإنتاج بتاعهم للشهر الحالي (مع تجميع أداء الفروع تحتهم)
 * - نفس منطق "أداء الفريق" الموجود في لوحة التحكم بالظبط
 */
async function getScopedTeamAchievement(userIds: string[]): Promise<AgentRow[]> {
  const monthStart = startOfMonth(new Date());
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');

  const { data: teamUsers } = await supabase
    .from('users')
    .select('id, name, role, target, manager_id, is_active')
    .in('id', userIds);

  if (!teamUsers) return [];

  const { data: payments } = await supabase
    .from('payments')
    .select('amount, installment:installment_id(policy:policy_id(owner_id))')
    .eq('payment_month', monthStartStr)
    .eq('is_cancelled', false);

  const directAchieved = new Map<string, number>();
  (payments || []).forEach((p: any) => {
    const ownerId = p.installment?.policy?.owner_id;
    if (!ownerId) return;
    directAchieved.set(ownerId, (directAchieved.get(ownerId) || 0) + Number(p.amount));
  });

  const childrenMap = new Map<string, string[]>();
  teamUsers.forEach((u) => {
    if (u.manager_id) {
      const list = childrenMap.get(u.manager_id) || [];
      list.push(u.id);
      childrenMap.set(u.manager_id, list);
    }
  });

  const rolledUpCache = new Map<string, number>();
  const getRolledUpAchieved = (userId: string): number => {
    if (rolledUpCache.has(userId)) return rolledUpCache.get(userId)!;
    let total = directAchieved.get(userId) || 0;
    const children = childrenMap.get(userId) || [];
    for (const childId of children) {
      total += getRolledUpAchieved(childId);
    }
    rolledUpCache.set(userId, total);
    return total;
  };

  return teamUsers
    .filter((u) => u.is_active)
    .map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role as UserRole,
      achieved: getRolledUpAchieved(u.id),
      target: u.target || 0
    }));
}

// ==============================
// الدوال اللي بيستخدمها المساعد
// ==============================

export interface AssistantAnswer {
  title: string;
  lines: string[];
  // اقتراحات قابلة للنقر (تُملأ فقط في حالة عدم التأكد من نية المستخدم)
  // تُتيح للواجهة عرضها كأزرار بدل نص عادي، دون كسر أي كود قديم يعتمد على lines فقط
  suggestions?: string[];
}

/** ملخص أداء اليوم */
export async function getTodaySummary(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');
  const todayStart = startOfDay(now).toISOString();
  const todayEnd = endOfDay(now).toISOString();

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
        .eq('due_date', format(now, 'yyyy-MM-dd')),
      supabase
        .from('installments')
        .select('id, policy:policy_id(owner_id, customer_id)')
        .eq('status', 'overdue')
    ]);

  const paymentsMonth = (paymentsMonthRes.data || []).filter((p: any) =>
    userIds.includes(p.installment?.policy?.owner_id)
  );
  const paymentsToday = (paymentsTodayRes.data || []).filter((p: any) =>
    userIds.includes(p.installment?.policy?.owner_id)
  );
  const dueTodayFiltered = (dueTodayRes.data || []).filter((i: any) =>
    userIds.includes(i.policy?.owner_id)
  );
  const overdueFiltered = (overdueRes.data || []).filter((i: any) =>
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

/** كم المتبقي لتحقيق الهدف */
export async function getRemainingTarget(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const monthStartStr = format(startOfMonth(new Date()), 'yyyy-MM-dd');

  const { data } = await supabase
    .from('payments')
    .select('amount, is_cancelled, installment:installment_id(policy:policy_id(owner_id))')
    .eq('payment_month', monthStartStr)
    .eq('is_cancelled', false);

  const achieved = (data || [])
    .filter((p: any) => userIds.includes(p.installment?.policy?.owner_id))
    .reduce((s: number, p: any) => s + Number(p.amount), 0);

  const target = Number(user.target || 0);
  const remaining = Math.max(0, target - achieved);
  const rate = target > 0 ? Math.round((achieved / target) * 100) : 0;

  return {
    title: '🎯 المتبقي لتحقيق الهدف',
    lines: [
      `الهدف الشهري: ${formatCurrency(target)}`,
      `المحقق حتى الآن: ${formatCurrency(achieved)} (${rate}%)`,
      `المتبقي: ${formatCurrency(remaining)}`
    ]
  };
}

/** أفضل / أقل الوكلاء */
export async function getAgentsRanking(user: User, direction: 'top' | 'bottom', count = 5): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const team = await getScopedTeamAchievement(userIds);
  const agentsOnly = team.filter((t) => t.role === 'agent' || t.role === 'premium_agent');

  const sorted = [...agentsOnly].sort((a, b) =>
    direction === 'top' ? b.achieved - a.achieved : a.achieved - b.achieved
  );
  const picked = sorted.slice(0, count);

  return {
    title: direction === 'top' ? `👑 أفضل ${count} وكلاء` : `📉 أقل ${count} وكلاء`,
    lines:
      picked.length === 0
        ? ['لا توجد بيانات كافية']
        : picked.map((a, idx) => `${idx + 1}. ${a.name} - ${formatCurrency(a.achieved)}`)
  };
}

/** التحصيل اليوم */
export async function getTodayCollection(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const todayStart = startOfDay(new Date()).toISOString();
  const todayEnd = endOfDay(new Date()).toISOString();

  const { data } = await supabase
    .from('payments')
    .select('amount, is_cancelled, installment:installment_id(is_first, policy:policy_id(owner_id))')
    .eq('is_cancelled', false)
    .gte('paid_at', todayStart)
    .lte('paid_at', todayEnd);

  const filtered = (data || []).filter((p: any) => userIds.includes(p.installment?.policy?.owner_id));
  const collection = filtered.filter((p: any) => !p.installment?.is_first);
  const production = filtered.filter((p: any) => p.installment?.is_first);

  return {
    title: '💰 التحصيل اليوم',
    lines: [
      `تحصيل دوري: ${formatCurrency(collection.reduce((s: number, p: any) => s + Number(p.amount), 0))} (${collection.length} عملية)`,
      `إنتاج جديد: ${formatCurrency(production.reduce((s: number, p: any) => s + Number(p.amount), 0))} (${production.length} عملية)`
    ]
  };
}

/** الوثائق (بوالص التأمين) المضافة اليوم */
export async function getTodayNewPolicies(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const todayStart = startOfDay(new Date()).toISOString();
  const todayEnd = endOfDay(new Date()).toISOString();

  const { data, count } = await supabase
    .from('policies')
    .select('policy_number, premium_amount, customer:customer_id(name)', { count: 'exact' })
    .in('owner_id', userIds)
    .gte('created_at', todayStart)
    .lte('created_at', todayEnd)
    .order('created_at', { ascending: false })
    .limit(10);

  return {
    title: '📄 الوثائق المضافة اليوم',
    lines:
      !data || data.length === 0
        ? ['لا توجد وثائق جديدة اليوم']
        : [
            `الإجمالي: ${count ?? data.length} وثيقة`,
            ...data.map((p: any) => `- ${p.policy_number} · ${p.customer?.name || ''}`)
          ]
  };
}

/** العملاء الجدد اليوم */
export async function getTodayNewCustomers(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const todayStart = startOfDay(new Date()).toISOString();
  const todayEnd = endOfDay(new Date()).toISOString();

  const { data, count } = await supabase
    .from('customers')
    .select('name, phone', { count: 'exact' })
    .in('owner_id', userIds)
    .gte('created_at', todayStart)
    .lte('created_at', todayEnd)
    .order('created_at', { ascending: false })
    .limit(10);

  return {
    title: '👥 العملاء الجدد اليوم',
    lines:
      !data || data.length === 0
        ? ['لا يوجد عملاء جدد اليوم']
        : [`الإجمالي: ${count ?? data.length} عميل`, ...data.map((c: any) => `- ${c.name}`)]
  };
}

/** العملاء المتأخرون */
export async function getOverdueCustomers(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);

  const { data } = await supabase
    .from('installments')
    .select('amount, policy:policy_id(owner_id, customer:customer_id(name))')
    .eq('status', 'overdue');

  const filtered = (data || []).filter((i: any) => userIds.includes(i.policy?.owner_id));

  const byCustomer = new Map<string, { name: string; amount: number }>();
  filtered.forEach((i: any) => {
    const name = i.policy?.customer?.name || 'غير معروف';
    const existing = byCustomer.get(name) || { name, amount: 0 };
    existing.amount += Number(i.amount);
    byCustomer.set(name, existing);
  });

  const rows = Array.from(byCustomer.values()).sort((a, b) => b.amount - a.amount).slice(0, 10);

  return {
    title: '⚠️ العملاء المتأخرون',
    lines:
      rows.length === 0
        ? ['لا يوجد عملاء متأخرون حاليًا 🎉']
        : [`إجمالي العملاء المتأخرين: ${byCustomer.size}`, ...rows.map((r) => `- ${r.name}: ${formatCurrency(r.amount)}`)]
  };
}

/** مهام اليوم (الأقساط المستحقة اليوم) */
export async function getTodayTasks(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const { data } = await supabase
    .from('installments')
    .select('amount, policy:policy_id(owner_id, customer:customer_id(name))')
    .eq('status', 'pending')
    .eq('due_date', todayStr);

  const filtered = (data || []).filter((i: any) => userIds.includes(i.policy?.owner_id));

  return {
    title: '📅 مهام اليوم',
    lines:
      filtered.length === 0
        ? ['لا توجد أقساط مستحقة اليوم']
        : [
            `عدد الأقساط المستحقة: ${filtered.length}`,
            ...filtered.slice(0, 10).map((i: any) => `- ${i.policy?.customer?.name || ''}: ${formatCurrency(Number(i.amount))}`)
          ]
  };
}

/** أداء رؤساء المجموعات */
export async function getGroupLeadersPerformance(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const team = await getScopedTeamAchievement(userIds);
  const groupLeaders = team
    .filter((t) => t.role === 'group_leader')
    .sort((a, b) => b.achieved - a.achieved);

  return {
    title: '📈 أداء رؤساء المجموعات',
    lines:
      groupLeaders.length === 0
        ? ['لا يوجد رؤساء مجموعات ضمن نطاقك']
        : groupLeaders.map((g) => {
            const rate = g.target > 0 ? Math.round((g.achieved / g.target) * 100) : 0;
            return `${g.name}: ${formatCurrency(g.achieved)} (${rate}%)`;
          })
  };
}

/** ملخص الفرع الكامل */
export async function getBranchSummary(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const monthStartStr = format(startOfMonth(new Date()), 'yyyy-MM-dd');

  const [customersRes, policiesRes, paymentsRes] = await Promise.all([
    supabase.from('customers').select('id', { count: 'exact', head: true }).in('owner_id', userIds),
    supabase.from('policies').select('id, status').in('owner_id', userIds),
    supabase
      .from('payments')
      .select('amount, is_cancelled, installment:installment_id(policy:policy_id(owner_id))')
      .eq('payment_month', monthStartStr)
      .eq('is_cancelled', false)
  ]);

  const policies = policiesRes.data || [];
  const activePolicies = policies.filter((p: any) => p.status === 'active').length;
  const payments = (paymentsRes.data || []).filter((p: any) => userIds.includes(p.installment?.policy?.owner_id));
  const totalCollected = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);

  return {
    title: '📋 ملخص الفرع',
    lines: [
      `عدد العملاء: ${customersRes.count ?? 0}`,
      `عدد الوثائق: ${policies.length} (منها ${activePolicies} نشطة)`,
      `إجمالي التحصيل هذا الشهر: ${formatCurrency(totalCollected)}`
    ]
  };
}

/** عدد الوكلاء (الإجمالي ضمن نطاق رؤية المستخدم) */
export async function getAgentsCount(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const team = await getScopedTeamAchievement(userIds);
  const agentsOnly = team.filter((t) => t.role === 'agent' || t.role === 'premium_agent');

  return {
    title: '👥 عدد الوكلاء',
    lines: [`إجمالي عدد الوكلاء: ${agentsOnly.length}`]
  };
}

/** عدد العملاء (الإجمالي الكلي، وليس فقط عملاء اليوم) */
export async function getCustomersCount(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);

  const { count } = await supabase
    .from('customers')
    .select('id', { count: 'exact', head: true })
    .in('owner_id', userIds);

  return {
    title: '👥 عدد العملاء',
    lines: [`إجمالي عدد العملاء: ${count ?? 0}`]
  };
}

/** عدد الوثائق (الإجمالي الكلي، وليس فقط وثائق اليوم) */
export async function getDocumentsCount(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);

  const { count } = await supabase
    .from('policies')
    .select('id', { count: 'exact', head: true })
    .in('owner_id', userIds);

  return {
    title: '📄 عدد الوثائق',
    lines: [`إجمالي عدد الوثائق: ${count ?? 0}`]
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

  const payments = (paymentsRes.data || []).filter((p: any) => userIds.includes(p.installment?.policy?.owner_id));
  const collection = payments.filter((p: any) => !p.installment?.is_first).reduce((s: number, p: any) => s + Number(p.amount), 0);
  const achieved = payments.reduce((s: number, p: any) => s + Number(p.amount), 0);
  const target = Number(user.target || 0);
  const dueTodayCount = (dueTodayRes.data || []).filter((i: any) => userIds.includes(i.policy?.owner_id)).length;

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
