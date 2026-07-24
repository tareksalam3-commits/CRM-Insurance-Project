import { isWithinInterval } from 'date-fns';
import type { UserRole } from '../../../lib/supabase';
import type { DashboardStats, TeamPerformance, TeamMemberDetail } from '../types';
import type { BranchRoleInfo } from '../../../lib/branchHierarchy';

// خريطة (manager_id → [children]) لأي مجموعة مستخدمين — تاخد خريطة role/
// manager_id خاصة بفرع معيّن (المرحلة 3) اختياريًا؛ لو اتمررت، بتتفوّق على
// manager_id/role العامين لكل مستخدم موجود فيها. من غيرها (أو لمستخدم مش
// موجود فيها) السلوك يرجع لاعتماد users.manager_id/users.role القديم مباشرة
// — بالظبط نفس النتيجة لمستخدم بوضع وظيفي واحد بس.
export function buildBranchAwareChildrenMap<T extends { id: string; manager_id: string | null }>(
  teamUsers: T[],
  branchRoles?: Map<string, BranchRoleInfo>,
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  teamUsers.forEach((u) => {
    const mgr = branchRoles?.has(u.id) ? branchRoles.get(u.id)!.manager_id : u.manager_id;
    if (!mgr) return;
    const list = map.get(mgr) || [];
    list.push(u.id);
    map.set(mgr, list);
  });
  return map;
}

const roleOfIn = (
  branchRoles: Map<string, BranchRoleInfo> | undefined,
  id: string,
  fallback: string,
): string => branchRoles?.get(id)?.role ?? fallback;

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
  const cancelledPolicies = policies.filter((p) => p.status === 'cancelled').length;

  const dueInstallments = filteredInstallments.filter((i: any) => {
    const dueDate = new Date(i.due_date);
    return isWithinInterval(dueDate, { start: monthStart, end: monthEnd });
  });

  // نفس أقساط "المستحق هذا الشهر" لكن مقسّمة حسب النوع (إنتاج جديد /
  // تحصيل دوري)، عشان نقدر نحسب "الإجمالي" الخاص بكل بطاقة على حدة أدناه.
  // ملاحظة: هذه الأقساط بحالة pending/overdue فقط (لم تُسدد بعد)، لذلك
  // إجمالي كل فئة = المسدد فعلاً هذا الشهر (newProduction/periodicCollection
  // أدناه) + المتبقي غير المسدد من نفس الفئة هنا.
  const dueNewProductionInstallments = dueInstallments.filter((i: any) => i.is_first);
  const duePeriodicInstallments = dueInstallments.filter((i: any) => !i.is_first);

  const overdueInstallments = filteredInstallments.filter((i: any) => {
    const dueDate = new Date(i.due_date);
    return dueDate < monthStart;
  });

  const newProduction = filteredPayments.filter((p: any) => p.installment?.is_first);
  const periodicCollection = filteredPayments.filter((p: any) => !p.installment?.is_first);

  const newProductionPaid = newProduction.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
  const periodicCollectionPaid = periodicCollection.reduce((sum: number, p: any) => sum + Number(p.amount), 0);

  const totalTarget = Number(target || 0);
  const totalAchieved = newProductionPaid + periodicCollectionPaid;

  return {
    totalCustomers: customersCount,
    totalPolicies: policies.length,
    activePolicies,
    cancelledPolicies,
    newProduction: newProductionPaid,
    newProductionCount: newProduction.length,
    newProductionTotal: newProductionPaid + dueNewProductionInstallments.reduce((sum: number, i: any) => sum + Number(i.amount), 0),
    periodicCollection: periodicCollectionPaid,
    periodicCollectionCount: periodicCollection.length,
    periodicCollectionTotal: periodicCollectionPaid + duePeriodicInstallments.reduce((sum: number, i: any) => sum + Number(i.amount), 0),
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
  branchRoles?: Map<string, BranchRoleInfo>,
): TeamPerformance[] {
  // Sum production directly owned by each user (policies registered under their own owner_id)
  const directAchieved = new Map<string, number>();
  payments.forEach((p: any) => {
    const ownerId = p.installment?.policy?.owner_id;
    if (!ownerId) return;
    directAchieved.set(ownerId, (directAchieved.get(ownerId) || 0) + Number(p.amount));
  });

  // Build a map of manager_id -> direct subordinate ids (within the currently visible subtree)
  // بيبني الهرم من user_branch_roles الخاصة بفرع معيّن لو اتمرر branchRoles،
  // وإلا بيرجع لاعتماد users.manager_id العام مباشرة (نفس السلوك القديم).
  const childrenMap = buildBranchAwareChildrenMap(teamUsers, branchRoles);

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

  // كل درجة وظيفية تعرض الدرجات اللي تحتها في كارت "أداء الفريق"، كل درجة
  // في قسم منفصل عن الباقي (بدل خلط كل الدرجات في قائمة واحدة):
  // - مدير التطوير: المراقبين العموم + المراقبين + رؤساء المجموعات (كل درجة قسم لوحده)
  // - المراقب العام: المراقبين + رؤساء المجموعات (كل درجة قسم لوحده)
  // - المراقب: رؤساء المجموعات + الوكلاء (كل درجة قسم لوحده)
  // - رئيس المجموعة: الوكلاء (درجة واحدة فقط)
  // - الوكيل: يرى أداءه فقط
  // - Super Admin: بلا قيود، يرى الجميع كما كان الحال سابقاً
  const VISIBLE_ROLES_BY_VIEWER: Partial<Record<UserRole, UserRole[]>> = {
    development_manager: ['general_supervisor', 'supervisor', 'group_leader'],
    general_supervisor: ['supervisor', 'group_leader'],
    supervisor: ['group_leader', 'agent', 'premium_agent'],
    group_leader: ['agent', 'premium_agent'],
    agent: ['agent'],
    premium_agent: ['premium_agent']
  };

  const allowedRoles = viewerRole ? VISIBLE_ROLES_BY_VIEWER[viewerRole] ?? null : null;

  const performance: TeamPerformance[] = teamUsers
    .filter((u) => u.is_active)
    .filter((u) => (allowedRoles ? allowedRoles.includes(roleOfIn(branchRoles, u.id, u.role) as UserRole) : true))
    .map((u) => ({
      id: u.id,
      name: u.name,
      role: roleOfIn(branchRoles, u.id, u.role) as UserRole,
      achieved: getRolledUpAchieved(u.id),
      target: u.target || 0
    }));

  // الترتيب هنا عام (تنازلياً بالمحقق)؛ تقسيم العرض حسب الدرجة الوظيفية
  // (بدل قائمة واحدة تخلط كل الدرجات) يتم في واجهة لوحة التحكم نفسها.
  return performance.sort((a, b) => b.achieved - a.achieved);
}

// ===================================
// تفاصيل أداء كل فرد في الفريق (للـ Bottom Sheet التفاعلي) — إضافية بالكامل،
// لا تُعدّل أو تُستبدل computeTeamPerformance أعلاه ولا تغيّر نتيجتها.
// نفس أسلوب "التجميع من الأسفل للأعلى" (direct + rolled-up من الفروع) لكن
// مقسّم إلى شقّين (إنتاج جديد / تحصيل) بدل رقم واحد مجمّع، ولكل أعضاء
// teamUsers جميعًا (لا يقتصر على الأدوار الظاهرة فى الكارت الرئيسي) حتى
// يمكن حساب أي مستوى يتم الوصول إليه أثناء التنقل الهرمي داخل الـ Sheet دون
// أي استعلامات إضافية (نفس البيانات المحمّلة أصلاً لبطاقة "أداء الفريق").
export function computeTeamAchievementDetails(
  teamUsers: { id: string; name: string; role: string; target: number | null; manager_id: string | null; is_active: boolean }[],
  payments: any[],
  // أقساط "المستحق هذا الشهر" (pending/overdue) — اختيارية حتى لا تنكسر أي
  // استدعاءات قديمة للدالة؛ تُستخدم فقط لحساب remainingNewProduction/
  // remainingCollection أدناه. بنفس شكل installmentsRaw فى dashboardCalculator
  // (id, amount, due_date, is_first, policy.owner_id).
  dueInstallments: any[] = [],
  // خريطة role/manager_id الخاصة بفرع معيّن (المرحلة 3) — اختيارية بالكامل.
  branchRoles?: Map<string, BranchRoleInfo>,
): Map<string, TeamMemberDetail> {
  const directNewProduction = new Map<string, number>();
  const directCollection = new Map<string, number>();
  payments.forEach((p: any) => {
    const ownerId = p.installment?.policy?.owner_id;
    if (!ownerId) return;
    if (p.installment?.is_first) {
      directNewProduction.set(ownerId, (directNewProduction.get(ownerId) || 0) + Number(p.amount));
    } else {
      directCollection.set(ownerId, (directCollection.get(ownerId) || 0) + Number(p.amount));
    }
  });

  // نفس فكرة direct*/collection أعلاه لكن للمتبقي غير المسدد من مستحقات
  // هذا الشهر (كل عنصر فى dueInstallments أصلاً لسه مش متسدد، status
  // pending/overdue، ومُفلتر على due_date ضمن الشهر الحالي من المستدعي).
  const directRemainingNewProduction = new Map<string, number>();
  const directRemainingCollection = new Map<string, number>();
  dueInstallments.forEach((i: any) => {
    const ownerId = i.policy?.owner_id;
    if (!ownerId) return;
    if (i.is_first) {
      directRemainingNewProduction.set(ownerId, (directRemainingNewProduction.get(ownerId) || 0) + Number(i.amount));
    } else {
      directRemainingCollection.set(ownerId, (directRemainingCollection.get(ownerId) || 0) + Number(i.amount));
    }
  });

  const childrenMap = buildBranchAwareChildrenMap(teamUsers, branchRoles);

  const cache = new Map<string, { newProduction: number; collection: number; remainingNewProduction: number; remainingCollection: number }>();
  const getRolledUp = (userId: string): { newProduction: number; collection: number; remainingNewProduction: number; remainingCollection: number } => {
    if (cache.has(userId)) return cache.get(userId)!;
    let newProduction = directNewProduction.get(userId) || 0;
    let collection = directCollection.get(userId) || 0;
    let remainingNewProduction = directRemainingNewProduction.get(userId) || 0;
    let remainingCollection = directRemainingCollection.get(userId) || 0;
    const children = childrenMap.get(userId) || [];
    for (const childId of children) {
      const rolledUp = getRolledUp(childId);
      newProduction += rolledUp.newProduction;
      collection += rolledUp.collection;
      remainingNewProduction += rolledUp.remainingNewProduction;
      remainingCollection += rolledUp.remainingCollection;
    }
    const result = { newProduction, collection, remainingNewProduction, remainingCollection };
    cache.set(userId, result);
    return result;
  };

  const result = new Map<string, TeamMemberDetail>();
  teamUsers.forEach((u) => {
    const { newProduction, collection, remainingNewProduction, remainingCollection } = getRolledUp(u.id);
    const achieved = newProduction + collection;
    const target = u.target || 0;
    result.set(u.id, {
      id: u.id,
      name: u.name,
      role: roleOfIn(branchRoles, u.id, u.role) as UserRole,
      managerId: branchRoles?.has(u.id) ? branchRoles.get(u.id)!.manager_id : u.manager_id,
      target,
      newProduction,
      collection,
      achieved,
      remaining: Math.max(0, target - achieved),
      rate: target > 0 ? Math.round((achieved / target) * 100) : 0,
      remainingNewProduction,
      remainingCollection,
    });
  });

  return result;
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
