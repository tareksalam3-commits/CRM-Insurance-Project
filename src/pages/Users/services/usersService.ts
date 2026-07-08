import { supabase, type User } from '../../../lib/supabase';
import type { UserFormData, PasswordFormData } from '../types';

const PAGE_SIZE = 10;

export async function fetchAllUsers(): Promise<User[]> {
  const { data } = await supabase
    .from('users')
    .select('id, name, role')
    .order('name');
  return (data as User[]) || [];
}

export interface FetchUsersParams {
  page: number;
  searchQuery: string;
  statusFilter: 'all' | 'active' | 'inactive';
}

export async function fetchUsersPage({ page, searchQuery, statusFilter }: FetchUsersParams) {
  let query = supabase
    .from('users')
    .select('*, manager:manager_id(id, name)', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (searchQuery) {
    query = query.or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`);
  }
  if (statusFilter !== 'all') {
    query = query.eq('is_active', statusFilter === 'active');
  }

  const from = (page - 1) * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  return {
    users: data as User[],
    totalPages: Math.ceil((count || 0) / PAGE_SIZE),
  };
}

async function getAccessToken(): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error('لا توجد جلسة نشطة');
  return accessToken;
}

// ── create / update user ───────────────────────────────
export async function saveUser(data: UserFormData, editingUser: User | null): Promise<{ created: boolean }> {
  const accessToken = await getAccessToken();
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  if (editingUser) {
    // ── UPDATE existing user ──────────────────────────
    const oldData = editingUser;

    // 1. update profile row
    const { error: updateErr } = await supabase
      .from('users')
      .update({
        name:       data.name,
        phone:      data.phone || null,
        role:       data.role,
        manager_id: data.manager_id || null,
        target:     data.target || 0,
        updated_at: new Date().toISOString(),
      })
      .eq('id', editingUser.id);

    if (updateErr) throw updateErr;

    // 2. if email changed → update via admin API
    if (data.email !== oldData.email) {
      const res = await fetch(`${supabaseUrl}/functions/v1/admin-update-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ user_id: editingUser.id, email: data.email }),
      });
      if (!res.ok) {
        const r = await res.json();
        throw new Error(r?.error || 'فشل تحديث البريد الإلكتروني');
      }
      // also update email in users table
      await supabase
        .from('users')
        .update({ email: data.email })
        .eq('id', editingUser.id);
    }

    // 3. log
    const action =
      oldData.role   !== data.role   ? 'role_update'   :
      oldData.target !== data.target ? 'target_update' : 'user_update';

    await supabase.rpc('log_activity', {
      p_action:       action,
      p_entity_type:  'user',
      p_entity_id:    editingUser.id,
      p_old_values:   oldData,
      p_new_values:   data,
    });

    return { created: false };
  }

  // ── CREATE new user ───────────────────────────────
  const tempPassword = '123456';

  const res = await fetch(`${supabaseUrl}/functions/v1/admin-create-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      name:       data.name,
      email:      data.email,
      password:   tempPassword,
      phone:      data.phone || null,
      role:       data.role,
      manager_id: data.manager_id || null,
      target:     data.target || 0,
    }),
  });

  const result = await res.json();
  if (!res.ok) {
    const msg = result?.error || 'خطأ غير معروف';
    if (msg.includes('already registered') || msg.includes('already been registered')) {
      throw new Error('البريد الإلكتروني مسجل مسبقاً');
    }
    throw new Error(msg);
  }

  return { created: true };
}

// تُستخدم من الواجهة لعرض كلمة المرور المؤقتة بعد الإنشاء
export const TEMP_PASSWORD = '123456';

// ── change password ────────────────────────────────────
export async function changeUserPassword(editingUser: User, data: PasswordFormData): Promise<void> {
  const accessToken = await getAccessToken();
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  const res = await fetch(`${supabaseUrl}/functions/v1/admin-update-user`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      user_id:  editingUser.id,
      password: data.password,
    }),
  });

  if (!res.ok) {
    const r = await res.json();
    throw new Error(r?.error || 'فشل تغيير كلمة المرور');
  }

  await supabase.rpc('log_activity', {
    p_action:      'user_update',
    p_entity_type: 'user',
    p_entity_id:   editingUser.id,
    p_old_values:  null,
    p_new_values:  { password_changed: true },
  });
}

// ── toggle active ──────────────────────────────────────
export async function toggleUserActive(u: User): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({ is_active: !u.is_active, updated_at: new Date().toISOString() })
    .eq('id', u.id);

  if (error) throw error;

  await supabase.rpc('log_activity', {
    p_action:      u.is_active ? 'user_disable' : 'user_enable',
    p_entity_type: 'user',
    p_entity_id:   u.id,
  });
}
