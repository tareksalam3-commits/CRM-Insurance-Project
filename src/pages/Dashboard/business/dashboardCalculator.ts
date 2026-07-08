import { isWithinInterval } from 'date-fns';
import type { UserRole } from '../../../lib/supabase';
import type { DashboardStats, TeamPerformance } from '../types';

export interface ComputeStatsParams {
  customersCount: number;
  policies: { id: string; status: string; owner_id: string }[];
  installmentsRaw: any[];
  paymentsRaw: any[];
  userIds: string[];
  monthStart: Date;
  monthEnd: Date;
  target: number;
}

export function computeDashboardStats({
  customersCount, policies, installmentsRaw, paymentsRaw, userIds, monthStart, monthEnd, target,
}: ComputeStatsParams): DashboardStats {
  const filteredInstallments = installmentsRaw.filter(
    (i: any) => userIds.includes(i.policy?.owner_id)
  );

  const filteredPayments = paymentsRaw.filter(
    (p: any) => userIds.includes(p.installment?.policy?.owner_id)
  );

  const activePolicies = policies.filter((p) => p.status === 'active').length;
  const suspendedPolicies = policies.filter((p) => p.status === 'suspended').length;
  const cancelledPolicies = policies.filter((p) => p.status === 'cancelled').length;

  const dueInstallments = filteredInstallments.filter((i: any) => {
    const dueDate = new Date(i.due_date);
    return isWithinInterval(dueDate, { start: monthStart, end: monthEnd });
  });

  const overdueInstallments = filteredInstallments.filter((i: any) => {
    const dueDate = new Date(i.due_date);
    return dueDate < monthStart;
  });

  const newProduction = filteredPayments.filter((p: any) => p.installment?.is_first);
  const periodicCollection = filteredPayments.filter((p: any) => !p.installment?.is_first);

  const totalTarget = Number(target || 0);
  const totalAchieved = newProduction.reduce((sum: number, p: any) => sum + Number(p.amount), 0) +
    periodicCollection.reduce((sum: number, p: any) => sum + Number(p.amount), 0);

  return {
    totalCustomers: customersCount,
    totalPolicies: policies.length,
    activePolicies,
    suspendedPolicies,
    cancelledPolicies,
    newProduction: newProduction.reduce((sum: number, p: any) => sum + Number(p.amount), 0),
    newProductionCount: newProduction.length,
    periodicCollection: periodicCollection.reduce((sum: number, p: any) => sum + Number(p.amount), 0),
    periodicCollectionCount: periodicCollection.length,
    dueInstallments: dueInstallments.reduce((sum: number, i: any) => sum + Number(i.amount), 0),
    dueInstallmentsCount: dueInstallments.length,
    overdueInstallments: overdueInstallments.reduce((sum: number, i: any) => sum + Number(i.amount), 0),
    overdueInstallmentsCount: overdueInstallments.length,
    paidInstallments: filteredPayments.reduce((sum: number, p: any) => sum + Number(p.amount), 0),
    paidInstallmentsCount: filteredPayments.length,
    target: totalTarget,
    achieved: totalAchieved,
    remaining: Math.max(0, totalTarget - totalAchieved),
    achievementRate: totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0
  };
}

export function computeTeamPerformance(
  teamUsers: { id: string; name: string; role: string; target: number | null; manager_id: string | null; is_active: boolean }[],
  payments: any[],
  viewerRole: UserRole | undefined,
): TeamPerformance[] {
  // Sum production directly owned by each user (policies registered under their own owner_id)
  const directAchieved = new Map<string, number>();
  payments.forEach((p: any) => {
    const ownerId = p.installment?.policy?.owner_id;
    if (!ownerId) return;
    directAchieved.set(ownerId, (directAchieved.get(ownerId) || 0) + Number(p.amount));
  });

  // Build a map of manager_id -> direct subordinate ids (within the currently visible subtree)
  const childrenMap = new Map<string, string[]>();
  teamUsers.forEach((u) => {
    if (u.manager_id) {
      const list = childrenMap.get(u.manager_id) || [];
      list.push(u.id);
      childrenMap.set(u.manager_id, list);
    }
  });

  // A manager/supervisor's achievement = their own direct production + the rolled-up
  // production of everyone below them in the hierarchy (so a supervisor sees credit
  // for their team's work even if they don't personally own any policies).
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

  // كل درجة وظيفية تعرض فقط الدرجتين اللي تحتها مباشرة في كارت "أداء الفريق":
  // - مدير التطوير: المراقبين العموم + المراقبين
  // - المراقب العام: المراقبين + رؤساء المجموعات
  // - المراقب: رؤساء المجموعات + الوكلاء
  // - رئيس المجموعة: الوكلاء (آخر درجتين في الهيكل، فتصبح درجة واحدة)
  // - الوكيل: يرى أداءه فقط
  // - Super Admin: بلا قيود، يرى الجميع كما كان الحال سابقاً
  const VISIBLE_ROLES_BY_VIEWER: Partial<Record<UserRole, UserRole[]>> = {
    development_manager: ['general_supervisor', 'supervisor'],
    general_supervisor: ['supervisor', 'group_leader'],
    supervisor: ['group_leader', 'agent', 'premium_agent'],
    group_leader: ['agent', 'premium_agent'],
    agent: ['agent'],
    premium_agent: ['premium_agent']
  };

  const allowedRoles = viewerRole ? VISIBLE_ROLES_BY_VIEWER[viewerRole] ?? null : null;

  const performance: TeamPerformance[] = teamUsers
    .filter((u) => u.is_active)
    .filter((u) => (allowedRoles ? allowedRoles.includes(u.role as UserRole) : true))
    .map((u) => ({
      id: u.id,
      name: u.name,
      role: u.role as UserRole,
      achieved: getRolledUpAchieved(u.id),
      target: u.target || 0
    }));

  return performance.sort((a, b) => b.achieved - a.achieved).slice(0, 5);
}

export function computeChartData(payments: any[], userIds: string[]) {
  const filteredPayments = payments.filter(
    (p: any) => userIds.includes(p.installment?.policy?.owner_id)
  );

  const production = filteredPayments
    .filter((p: any) => p.installment?.is_first)
    .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

  const collection = filteredPayments
    .filter((p: any) => !p.installment?.is_first)
    .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

  return { production, collection };
}
