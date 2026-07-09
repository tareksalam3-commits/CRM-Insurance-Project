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

export async function payInstallment(installment: InstallmentWithPayment, userId: string, paymentDate: Date): Promise<void> {
  // payment_month = الشهر الفعلي للدفع (حسب التاريخ اللي تم اختياره)، مش
  // بالضرورة الشهر الحالي — عشان يدخل تارجت الشهر الصحيح لو السداد اتسجل
  // متأخر عن تاريخه الفعلي. paid_at بياخد نفس التاريخ المُختار (بتوقيت الآن
  // في نفس اليوم) عشان يظهر صحيح في كل الشاشات.
  const now = new Date();
  const paidAt = new Date(paymentDate);
  paidAt.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
  const paymentMonth = format(startOfMonth(paymentDate), 'yyyy-MM-dd');

  const { error } = await supabase
    .from('payments')
    .insert({
      installment_id: installment.id,
      amount: installment.amount,
      paid_by_user_id: userId,
      paid_at: paidAt.toISOString(),
      payment_month: paymentMonth,
    });

  if (error) {
    // رسالة "الشهر مقفل" جايه من الداتابيز مباشرة (trigger) وواضحة للمستخدم زي ما هي
    throw new Error(error.message || 'حدث خطأ أثناء تسجيل السداد');
  }

  // تسجيل في سجل النشاط
  await supabase.rpc('log_activity', {
    p_action: 'payment_create',
    p_entity_type: 'installment',
    p_entity_id: installment.id,
  });
}

// ===================================
// إجراءات الوثيقة (نفس منطق صفحة الوثائق، منقول هنا عشان يظهر نفس الأزرار
// المطلوبة في صفحة تفاصيل الوثيقة أيضاً - أينما فُتحت الوثيقة)
// ===================================
export async function changePolicyStatus(policy: PolicyWithRelations, newStatus: 'active' | 'suspended' | 'cancelled'): Promise<void> {
  const updateData: any = {
    status: newStatus,
    updated_at: new Date().toISOString()
  };

  if (newStatus === 'suspended') {
    updateData.suspended_at = new Date().toISOString();
    updateData.suspended_reason = 'إيقاف يدوي';
  } else if (newStatus === 'active' && policy.status === 'suspended') {
    updateData.suspended_at = null;
    updateData.suspended_reason = null;
  }

  const { error } = await supabase
    .from('policies')
    .update(updateData)
    .eq('id', policy.id);

  if (error) throw error;

  const action = newStatus === 'suspended' ? 'policy_suspend' :
                 newStatus === 'cancelled' ? 'policy_cancel' :
                 'policy_reactivate';

  await supabase.rpc('log_activity', {
    p_action: action,
    p_entity_type: 'policy',
    p_entity_id: policy.id
  });
}

export async function checkPolicyDeletable(policyId: string): Promise<boolean> {
  const currentMonth = format(startOfMonth(new Date()), 'yyyy-MM-dd');

  const { data: installmentsData } = await supabase
    .from('installments')
    .select('id')
    .eq('policy_id', policyId);

  const installmentIds = (installmentsData || []).map((i: any) => i.id);
  if (installmentIds.length === 0) return true;

  const { data: paymentsData } = await supabase
    .from('payments')
    .select('id')
    .in('installment_id', installmentIds)
    .eq('is_cancelled', false)
    .neq('payment_month', currentMonth)
    .limit(1);

  return (paymentsData || []).length === 0;
}

export async function deletePolicySafe(policyId: string): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('delete_policy_safe', { p_policy_id: policyId });

  if (error) {
    if (error.message?.includes('دفعات مسددة من شهور سابقة')) {
      return { error: 'لا يمكن حذف هذه الوثيقة لوجود دفعات مسددة من شهور سابقة' };
    } else if (error.message?.includes('صلاحية')) {
      return { error: 'ليس لديك صلاحية لحذف هذه الوثيقة' };
    }
    throw error;
  }

  return {};
}
