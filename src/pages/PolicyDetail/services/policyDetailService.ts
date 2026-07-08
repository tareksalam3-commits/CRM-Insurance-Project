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
