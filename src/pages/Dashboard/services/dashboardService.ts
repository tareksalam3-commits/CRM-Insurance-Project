import { supabase } from '../../../lib/supabase';
import { format, startOfMonth } from 'date-fns';

export async function fetchUserSubtreeIds(userId: string): Promise<string[]> {
  const { data: subtree } = await supabase.rpc('get_user_subtree', {
    user_id: userId
  });
  return subtree || [userId];
}

export async function fetchDashboardRawData(userIds: string[], monthStartStr: string) {
  const [
    customersRes,
    policiesRes,
    installmentsRes,
    paymentsRes
  ] = await Promise.all([
    supabase
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .in('owner_id', userIds),

    supabase
      .from('policies')
      .select('id, status, owner_id')
      .in('owner_id', userIds),

    supabase
      .from('installments')
      .select('id, amount, due_date, status, is_first, policy:policy_id(owner_id)')
      .in('status', ['pending', 'overdue']),

    supabase
      .from('payments')
      .select('id, amount, payment_month, is_cancelled, installment:installment_id(is_first, policy:policy_id(owner_id))')
      .eq('payment_month', monthStartStr)
      .eq('is_cancelled', false)
  ]);

  return { customersRes, policiesRes, installmentsRes, paymentsRes };
}

export async function fetchTeamUsers(userIds: string[]) {
  const { data: teamUsers } = await supabase
    .from('users')
    .select('id, name, role, target, manager_id, is_active')
    .in('id', userIds);
  return teamUsers || [];
}

export async function fetchMonthPayments(monthStartStr: string) {
  const { data: payments } = await supabase
    .from('payments')
    .select('amount, installment:installment_id(policy:policy_id(owner_id))')
    .eq('payment_month', monthStartStr)
    .eq('is_cancelled', false);
  return payments || [];
}

export async function fetchMonthPaymentsWithFirstFlag(monthStartStr: string) {
  const { data: payments } = await supabase
    .from('payments')
    .select('amount, installment:installment_id(is_first, policy:policy_id(owner_id))')
    .eq('payment_month', monthStartStr)
    .eq('is_cancelled', false);
  return payments || [];
}

export const getCurrentMonthStartStr = () => format(startOfMonth(new Date()), 'yyyy-MM-dd');
