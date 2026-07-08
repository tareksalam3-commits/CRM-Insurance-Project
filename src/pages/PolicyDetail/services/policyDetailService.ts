import { supabase } from '../../../lib/supabase';
import { format, startOfMonth } from 'date-fns';
import type { InstallmentWithPayment, PolicyWithRelations } from '../types';

export async function fetchPolicyById(id: string): Promise<PolicyWithRelations> {
  const { data, error } = await supabase
    .from('policies')
    .select(`
      *,
      customer:customer_id(id, name, phone, national_id),
      owner:owner_id(id, name)
    `)
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as PolicyWithRelations;
}

export async function fetchInstallmentsByPolicyId(policyId: string): Promise<InstallmentWithPayment[]> {
  const { data, error } = await supabase
    .from('installments')
    .select(`
      *,
      payments(id, is_cancelled)
    `)
    .eq('policy_id', policyId)
    .order('installment_number', { ascending: true });

  if (error) throw error;
  return (data as InstallmentWithPayment[]) || [];
}

export async function payInstallment(installment: InstallmentWithPayment, userId: string): Promise<void> {
  // payment_month = الشهر الفعلي للدفع (وليس تاريخ استحقاق القسط)
  // هذا يدعم السداد المبكر تلقائياً
  const now = new Date();
  const paymentMonth = format(startOfMonth(now), 'yyyy-MM-dd');

  const { error } = await supabase
    .from('payments')
    .insert({
      installment_id: installment.id,
      amount: installment.amount,
      paid_by_user_id: userId,
      payment_month: paymentMonth,
    });

  if (error) throw error;

  // تسجيل في سجل النشاط
  await supabase.rpc('log_activity', {
    p_action: 'payment_create',
    p_entity_type: 'installment',
    p_entity_id: installment.id,
  });
}
