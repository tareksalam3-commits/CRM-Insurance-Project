import { supabase } from '../../../lib/supabase';
import { format } from 'date-fns';
import { dalRead } from '../../../lib/dataAccessLayer';

// ===================================
// كل دوال القراءة هنا بقت تمر من dalRead (طبقة الوصول الموحدة للبيانات):
// أونلاين بترجع بيانات حقيقية وتحفظها فى الكاش، وأوفلاين (أو عند فشل
// الشبكة/تعليقها) بترجع آخر نسخة محفوظة أو شكل فاضٍ متوافق مع النوع بدل
// ما تعلّق الصفحة فى Loading أو تنهار. راجع lib/dataAccessLayer.ts.
// ===================================

export async function fetchUserSubtreeIds(userId: string): Promise<string[]> {
  const result = await dalRead(
    `reports:subtree:${userId}`,
    async () => {
      const { data: subtree, error } = await supabase.rpc('get_user_subtree', { user_id: userId });
      if (error) throw error;
      return (subtree as string[]) || [userId];
    },
    { emptyValue: [userId] },
  );
  return result.data;
}

export async function fetchCustomersInRange(userIds: string[], start: Date, end: Date) {
  const result = await dalRead(
    `reports:customersInRange:${userIds.slice().sort().join(',')}:${start.toISOString()}:${end.toISOString()}`,
    async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, created_at')
        .in('owner_id', userIds)
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString())
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );
  return result.data;
}

export async function fetchPoliciesForOwners(userIds: string[]) {
  const result = await dalRead(
    `reports:policiesForOwners:${userIds.slice().sort().join(',')}`,
    async () => {
      const { data, error } = await supabase
        .from('policies')
        .select('id, policy_number, status, policy_type, start_date, customer:customer_id(name)')
        .in('owner_id', userIds)
        .order('start_date', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );
  return result.data;
}

export async function fetchPaymentsInRange(start: Date, end: Date) {
  const result = await dalRead(
    `reports:paymentsInRange:${format(start, 'yyyy-MM-dd')}:${format(end, 'yyyy-MM-dd')}`,
    async () => {
      const { data, error } = await supabase
        .from('payments')
        .select(
          'amount, payment_month, installment:installment_id(is_first, policy:policy_id(owner_id, policy_number, customer:customer_id(name), owner:owner_id(name)))'
        )
        .gte('payment_month', format(start, 'yyyy-MM-dd'))
        .lte('payment_month', format(end, 'yyyy-MM-dd'))
        .eq('is_cancelled', false);
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );
  return result.data;
}

export async function fetchAllInstallmentsWithPolicy() {
  const result = await dalRead(
    `reports:allInstallmentsWithPolicy`,
    async () => {
      const { data, error } = await supabase
        .from('installments')
        .select('id, amount, due_date, status, policy:policy_id(owner_id, policy_number, customer:customer_id(name))');
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );
  return result.data;
}

export async function fetchAgentsForReport(userIds: string[]) {
  const result = await dalRead(
    `reports:agentsForReport:${userIds.slice().sort().join(',')}`,
    async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, target')
        .in('id', userIds)
        .in('role', ['agent', 'premium_agent'])
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );
  return result.data;
}

export async function fetchSimplePaymentsInRange(start: Date, end: Date) {
  const result = await dalRead(
    `reports:simplePaymentsInRange:${format(start, 'yyyy-MM-dd')}:${format(end, 'yyyy-MM-dd')}`,
    async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('amount, installment:installment_id(policy:policy_id(owner_id))')
        .gte('payment_month', format(start, 'yyyy-MM-dd'))
        .lte('payment_month', format(end, 'yyyy-MM-dd'))
        .eq('is_cancelled', false);
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );
  return result.data;
}

export async function fetchUsersByRole(userIds: string[], roles: string[]) {
  const result = await dalRead(
    `reports:usersByRole:${userIds.slice().sort().join(',')}:${roles.slice().sort().join(',')}`,
    async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name')
        .in('id', userIds)
        .in('role', roles)
        .eq('is_active', true);
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );
  return result.data;
}

// نجيب أداء كل قائد (رئيس مجموعة/مراقب) ضمن قائمة معينة.
// ملاحظة أداء: الاستعلام عن المدفوعات لنفس الفترة الزمنية كان يتكرر داخل كل تكرار
// من الحلقة رغم أنه نفس الاستعلام بالضبط في كل مرة — تم رفعه خارج الحلقة ليُنفَّذ مرة واحدة فقط
// (تحسين أداء بحت، لا يغيّر أي نتيجة لأن نفس بيانات المدفوعات تُستخدم للتصفية بعدها).
export async function fetchLeadersPerformance(
  leaders: { id: string; name: string }[],
  start: Date,
  end: Date,
): Promise<{ id: string; name: string; count: number; achieved: number }[]> {
  const payments = await fetchSimplePaymentsInRange(start, end);
  const performance: { id: string; name: string; count: number; achieved: number }[] = [];

  for (const leader of leaders) {
    const teamIds = await fetchUserSubtreeIds(leader.id);

    const achieved = payments
      .filter((p: any) => teamIds.includes(p.installment?.policy?.owner_id))
      .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

    performance.push({
      id: leader.id,
      name: leader.name,
      count: teamIds.length - 1,
      achieved
    });
  }

  return performance;
}
