import { supabase } from '../../../lib/supabase';
import type { BasicUser, PaymentRow } from '../types';

// ─── data access layer: كل استعلامات Supabase الخاصة بصفحة تقفيل الشهر ───

export async function fetchClosingRecord(monthStr: string) {
  const { data } = await supabase
    .from('monthly_closings')
    .select('*, closed_by:closed_by_user_id(name), opened_by:opened_by_user_id(name)')
    .eq('month', monthStr)
    .maybeSingle();
  return data;
}

export async function fetchUserSubtreeIds(userId: string): Promise<string[]> {
  const { data } = await supabase.rpc('get_user_subtree', { user_id: userId });
  return data || [userId];
}

export async function fetchUsersByIds(ids: string[]): Promise<BasicUser[]> {
  const { data } = await supabase
    .from('users')
    .select('id, name, role, manager_id')
    .in('id', ids);
  return (data || []) as BasicUser[];
}

export async function fetchMonthPayments(monthStr: string): Promise<any[]> {
  const { data } = await supabase
    .from('payments')
    .select(`
      id, amount, paid_at,
      installment:installment_id (
        installment_number, is_first,
        policy:policy_id (
          policy_number, owner_id,
          customer:customer_id ( name )
        )
      )
    `)
    .eq('payment_month', monthStr)
    .eq('is_cancelled', false);
  return data || [];
}

export function filterPaymentsByOwnerIds(paymentsRaw: any[], ids: string[]): PaymentRow[] {
  return paymentsRaw.filter((p: any) => ids.includes(p.installment?.policy?.owner_id)) as PaymentRow[];
}

export async function closeMonth(monthStr: string, userId: string) {
  const { error } = await supabase.from('monthly_closings').insert({
    month: monthStr, closed_by_user_id: userId, is_open: false,
  });
  if (error?.code === '23505') {
    await supabase.from('monthly_closings')
      .update({ is_open: false, opened_at: null, opened_by_user_id: null })
      .eq('month', monthStr);
  } else if (error) {
    throw error;
  }
  await supabase.rpc('log_activity', { p_action: 'month_close', p_entity_type: 'monthly_closing' });
}

export async function openMonth(monthStr: string, userId: string) {
  const { error } = await supabase.from('monthly_closings')
    .update({ is_open: true, opened_at: new Date().toISOString(), opened_by_user_id: userId })
    .eq('month', monthStr);
  if (error) throw error;
  await supabase.rpc('log_activity', { p_action: 'month_open', p_entity_type: 'monthly_closing' });
}
