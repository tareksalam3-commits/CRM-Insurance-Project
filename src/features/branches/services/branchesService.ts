// طبقة الوصول لبيانات شاشة إدارة الفروع (Super Admin / Development Manager
// بس، محمية أصلاً بصلاحيات RLS على مستوى قاعدة البيانات — راجع migration
// 052_create_branches_tables). كل قراءة هنا لازم تعدّي على dalRead بدل
// استدعاء supabase.from() مباشر، بنفس النمط المتبع فى باقي خدمات المشروع
// (مثال: features/subscriptions/services/adminService.ts).
//
// هذه الخدمة مرحلة أولى فقط: بتكتب/تقرأ من branches و user_branch_roles
// بدون أي تأثير على users أو أي حاسبة/تقرير موجود.
import { supabase } from '../../../lib/supabase';
import { dalRead } from '../../../lib/dataAccessLayer';
import type { Branch, UserBranchRoleRow, UserLookupRow } from '../types';
import type { UserRole } from '../../../lib/supabase';

export async function fetchBranches(): Promise<Branch[]> {
  const result = await dalRead(
    'branchesAdmin:branches',
    async () => {
      const { data, error } = await supabase
        .from('branches')
        .select('*')
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as Branch[];
    },
    { emptyValue: [] as Branch[] },
  );
  return result.data;
}

export async function fetchUserBranchRoles(): Promise<UserBranchRoleRow[]> {
  const result = await dalRead(
    'branchesAdmin:userBranchRoles',
    async () => {
      const { data, error } = await supabase
        .from('user_branch_roles')
        .select(
          '*, user:user_id(id, name, role), manager:manager_id(id, name), branch:branch_id(id, name, is_headquarters)'
        )
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as UserBranchRoleRow[];
    },
    { emptyValue: [] as UserBranchRoleRow[] },
  );
  return result.data;
}

export async function fetchUsersLookup(): Promise<UserLookupRow[]> {
  const result = await dalRead(
    'branchesAdmin:usersLookup',
    async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, role')
        .order('name', { ascending: true });
      if (error) throw error;
      return (data || []) as UserLookupRow[];
    },
    { emptyValue: [] as UserLookupRow[] },
  );
  return result.data;
}

export async function createBranch(name: string): Promise<void> {
  const { error } = await supabase.from('branches').insert({ name: name.trim() });
  if (error) throw error;
}

export async function setBranchActive(branchId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('branches')
    .update({ is_active: isActive, updated_at: new Date().toISOString() })
    .eq('id', branchId);
  if (error) throw error;
}

export interface AddUserBranchRoleInput {
  userId: string;
  branchId: string;
  role: UserRole;
  managerId: string | null;
  isPrimary?: boolean;
}

export async function addUserBranchRole(input: AddUserBranchRoleInput): Promise<void> {
  const { error } = await supabase.from('user_branch_roles').insert({
    user_id: input.userId,
    branch_id: input.branchId,
    role: input.role,
    manager_id: input.managerId,
    is_primary: input.isPrimary ?? false,
  });
  if (error) throw error;
}

export async function fetchUserBranchRolesForUser(userId: string): Promise<UserBranchRoleRow[]> {
  const result = await dalRead(
    `branchesAdmin:userBranchRoles:byUser:${userId}`,
    async () => {
      const { data, error } = await supabase
        .from('user_branch_roles')
        .select(
          '*, user:user_id(id, name, role), manager:manager_id(id, name), branch:branch_id(id, name, is_headquarters)'
        )
        .eq('user_id', userId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data || []) as unknown as UserBranchRoleRow[];
    },
    { emptyValue: [] as UserBranchRoleRow[] },
  );
  return result.data;
}

export interface UpdateUserBranchRoleInput {
  role?: UserRole;
  managerId?: string | null;
  isPrimary?: boolean;
}

export async function updateUserBranchRole(id: string, input: UpdateUserBranchRoleInput): Promise<void> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (input.role !== undefined) updates.role = input.role;
  if (input.managerId !== undefined) updates.manager_id = input.managerId;
  if (input.isPrimary !== undefined) updates.is_primary = input.isPrimary;
  const { error } = await supabase.from('user_branch_roles').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteUserBranchRole(id: string): Promise<void> {
  const { error } = await supabase.from('user_branch_roles').delete().eq('id', id);
  if (error) throw error;
}
