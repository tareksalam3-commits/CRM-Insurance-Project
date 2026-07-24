import { supabase } from './supabase';
import { dalRead } from './dataAccessLayer';
import type { UserRole } from './supabase';

// ===================================
// المرحلة الثالثة من دعم "تعدد الفروع" — Helper مشترك واحد تستخدمه كل
// الحاسبات/الخدمات (إقفال الشهر، الإلغاءات، لوحة التحكم، الهيكل التنظيمي،
// التقارير اليومية) بدل ما كل صفحة تكرر نفس منطق القراءة من
// get_user_subtree_branch_aware و user_branch_roles.
//
// مبدأ التوافق مع الخلف: أي استدعاء بـ branchId = null/undefined بيرجع
// بالظبط نفس سلوك ما قبل هذه المرحلة (الهرم القديم المعتمد على
// users.manager_id عبر get_user_subtree الأصلية) — راجع migration 054.
// ===================================

export interface BranchRoleInfo {
  role: UserRole;
  manager_id: string | null;
}

/**
 * "نطاق" المستخدم (هو نفسه + كل من تحته) — بيستخدم get_user_subtree_branch_aware
 * الجديدة (migration 054): لو branchId فاضي، بترجع بالظبط نفس نتيجة
 * get_user_subtree الأصلية (عابرة للفروع، بالاعتماد على users.manager_id)،
 * ولو branchId موجود، بتمشي فى السلسلة بالاعتماد على user_branch_roles
 * الخاصة بنفس الفرع بس.
 */
export async function fetchUserSubtreeIdsBranchAware(
  cacheKeyPrefix: string,
  userId: string,
  branchId?: string | null,
): Promise<string[]> {
  const result = await dalRead(
    `${cacheKeyPrefix}:subtree:${userId}:${branchId ?? 'none'}`,
    async () => {
      const { data, error } = await supabase.rpc('get_user_subtree_branch_aware', {
        user_id: userId,
        branch_id: branchId ?? null,
      });
      if (error) throw error;
      return (data as string[]) || [userId];
    },
    { emptyValue: [userId] },
  );
  return result.data;
}

/**
 * خريطة (user_id → {role, manager_id}) الخاصة بفرع معيّن بس، من
 * user_branch_roles مباشرة — القراءة متاحة لأي مستخدم مسجّل دخول (راجع
 * user_branch_roles_select_authenticated فى migration 052).
 *
 * لو branchId فاضي (مفيش فرع محدد — الحالة الطبيعية لغالبية المستخدمين
 * اللي عندهم وضع وظيفي واحد بس)، بترجع Map فاضية عمداً: أي كود بيستخدمها
 * لازم يرجع فى هذه الحالة لقراءة role/manager_id العامين من users مباشرة
 * (نفس السلوك القديم تمامًا) بدل الاعتماد على هذه الدالة.
 */
export async function fetchBranchRoleMap(
  branchId: string | null | undefined,
  userIds: string[],
): Promise<Map<string, BranchRoleInfo>> {
  if (!branchId || userIds.length === 0) return new Map();

  const result = await dalRead(
    `branchRoleMap:${branchId}:${userIds.slice().sort().join(',')}`,
    async () => {
      const { data, error } = await supabase
        .from('user_branch_roles')
        .select('user_id, role, manager_id')
        .eq('branch_id', branchId)
        .in('user_id', userIds);
      if (error) throw error;
      return (data || []) as { user_id: string; role: UserRole; manager_id: string | null }[];
    },
    { emptyValue: [] as { user_id: string; role: UserRole; manager_id: string | null }[] },
  );

  return new Map(result.data.map((r) => [r.user_id, { role: r.role, manager_id: r.manager_id }]));
}
