import { supabase, User, UserRole } from '../../../lib/supabase';
import { startOfMonth, format } from 'date-fns';
import { dalRead } from '../../../lib/dataAccessLayer';
import type { AgentRow } from '../types';

// ==============================
// أدوات مساعدة عامة
//
// كل قراءة بيانات فى هذا الملف (مساعد الذكاء الاصطناعي) بتمر من dalRead
// بنفس نمط باقي الـ Services (راجع dashboardService.ts) — أونلاين بترجع
// بيانات حقيقية وتحفظها فى الكاش، وأوفلاين بترجع آخر نسخة محفوظة أو شكل
// فاضٍ متوافق بدل ما تعلّق أو تنهار محادثة المساعد.
// ==============================

export async function getScopedUserIds(user: User): Promise<string[]> {
  const result = await dalRead(
    `assistant:subtree:${user.id}`,
    async () => {
      const { data, error } = await supabase.rpc('get_user_subtree', { user_id: user.id });
      if (error) throw error;
      return (data as string[]) || [user.id];
    },
    { emptyValue: [user.id] },
  );
  return result.data;
}

/**
 * بيرجع كل المستخدمين النشطين في نطاق رؤية المستخدم الحالي، مع إجمالي
 * التحصيل/الإنتاج بتاعهم للشهر الحالي (مع تجميع أداء الفروع تحتهم)
 * - نفس منطق "أداء الفريق" الموجود في لوحة التحكم بالظبط
 */
interface ScopedTeamRaw {
  teamUsers: any[];
  payments: any[];
}

async function fetchScopedTeamRaw(userIds: string[], monthStartStr: string): Promise<ScopedTeamRaw> {
  const result = await dalRead(
    `assistant:teamAchievement:${userIds.slice().sort().join(',')}:${monthStartStr}`,
    async () => {
      const { data: teamUsers, error: usersError } = await supabase
        .from('users')
        .select('id, name, role, target, manager_id, is_active')
        .in('id', userIds);
      if (usersError) throw usersError;

      const { data: payments, error: paymentsError } = await supabase
        .from('payments')
        .select('amount, installment:installment_id(policy:policy_id(owner_id))')
        .eq('payment_month', monthStartStr)
        .eq('is_cancelled', false);
      if (paymentsError) throw paymentsError;

      return { teamUsers: teamUsers || [], payments: payments || [] };
    },
    { emptyValue: { teamUsers: [], payments: [] } },
  );
  return result.data;
}

export async function getScopedTeamAchievement(userIds: string[]): Promise<AgentRow[]> {
  const monthStart = startOfMonth(new Date());
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');

  const { teamUsers, payments } = await fetchScopedTeamRaw(userIds, monthStartStr);

  if (!teamUsers) return [];

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
