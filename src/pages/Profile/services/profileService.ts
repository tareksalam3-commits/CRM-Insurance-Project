import { supabase } from '../../../lib/supabase';
import type { ProfileFormData } from '../types';

export async function fetchRankAmongSameRole(role: string, userId: string): Promise<{ rank: number; total: number } | null> {
  // 1. Get all users with the same role and their policy counts
  const { data: sameRoleUsers, error: usersError } = await supabase
    .from('users')
    .select('id')
    .eq('role', role)
    .eq('is_active', true);

  if (usersError || !sameRoleUsers) return null;

  const userIds = sameRoleUsers.map((u: { id: string }) => u.id);

  // Get policy counts for each user with same role
  const { data: policyCounts, error: policiesError } = await supabase
    .from('policies')
    .select('owner_id')
    .in('owner_id', userIds);

  if (policiesError || !policyCounts) return null;

  // Count policies per user
  const countMap: Record<string, number> = {};
  for (const p of policyCounts) {
    countMap[p.owner_id] = (countMap[p.owner_id] || 0) + 1;
  }

  const myCount = countMap[userId] || 0;
  // Rank = number of users with more policies than me + 1
  const rank = Object.values(countMap).filter((c) => c > myCount).length + 1;

  return { rank, total: userIds.length };
}

export async function fetchPaidThisMonthCount(userId: string): Promise<number | null> {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

  const { data: payments, error: paymentsError } = await supabase
    .from('payments')
    .select('id, installment_id, is_cancelled, installments!inner(policy_id, policies!inner(owner_id))')
    .eq('is_cancelled', false)
    .gte('payment_month', monthStart)
    .lte('payment_month', monthEnd);

  if (paymentsError || !payments) return null;

  // Filter only payments for this user's policies
  const myPayments = payments.filter((pay: any) => {
    return pay.installments?.policies?.owner_id === userId;
  });

  return myPayments.length;
}

export async function updateProfile(userId: string, data: ProfileFormData): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({
      name: data.name,
      phone: data.phone,
      registration_number: data.registration_number,
      updated_at: new Date().toISOString()
    } as any)
    .eq('id', userId);

  if (error) throw error;
}

export async function changePassword(email: string, currentPassword: string, newPassword: string): Promise<{ error?: string }> {
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword
  });

  if (signInError) {
    return { error: 'كلمة المرور الحالية غير صحيحة' };
  }

  const { error } = await supabase.auth.updateUser({
    password: newPassword
  });

  if (error) throw error;

  return {};
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const fileExt = file.name.split('.').pop();
  // Use fixed filename per user to overwrite old avatar
  const filePath = `avatars/${userId}.${fileExt}`;

  // Upload with upsert to overwrite existing file
  const { error: uploadError } = await supabase.storage
    .from('profiles')
    .upload(filePath, file, { upsert: true });

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from('profiles')
    .getPublicUrl(filePath);

  // Add cache-busting to force image refresh
  const urlWithTimestamp = `${publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase
    .from('users')
    .update({ avatar_url: urlWithTimestamp } as any)
    .eq('id', userId);

  if (updateError) throw updateError;

  return urlWithTimestamp;
}
