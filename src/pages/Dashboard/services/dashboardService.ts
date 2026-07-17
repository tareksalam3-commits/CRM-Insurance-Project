import { supabase } from '../../../lib/supabase';
import { format, startOfMonth } from 'date-fns';
import { dalRead } from '../../../lib/dataAccessLayer';

// ===================================
// كل دوال القراءة هنا بقت تمر من dalRead (طبقة الوصول الموحدة للبيانات):
// أونلاين بترجع بيانات حقيقية وتحفظها فى الكاش، وأوفلاين (أو عند فشل
// الشبكة/تعليقها) بترجع آخر نسخة محفوظة أو شكل فاضٍ متوافق مع النوع بدل
// ما تعلّق الصفحة فى Loading أو تنهار. راجع lib/dataAccessLayer.ts.
// ===================================

export async function fetchUserSubtreeIds(userId: string): Promise<string[]> {
  const result = await dalRead(
    `dashboard:subtree:${userId}`,
    async () => {
      const { data: subtree, error } = await supabase.rpc('get_user_subtree', { user_id: userId });
      if (error) throw error;
      return (subtree as string[]) || [userId];
    },
    { emptyValue: [userId] },
  );
  return result.data;
}

// نفس شكل النتيجة الأصلي بالظبط (customersRes/policiesRes/installmentsRes/paymentsRes
// بحقول data/count) حتى لا نحتاج نغيّر أي كود فى Dashboard/index.tsx —
// الصفحة تستفيد من الحماية تلقائياً دون أي تعديل فيها.
export interface DashboardRawData {
  customersRes: { data: any[] | null; count: number | null };
  policiesRes: { data: any[] | null };
  installmentsRes: { data: any[] | null };
  paymentsRes: { data: any[] | null };
}

const EMPTY_DASHBOARD_RAW: DashboardRawData = {
  customersRes: { data: [], count: 0 },
  policiesRes: { data: [] },
  installmentsRes: { data: [] },
  paymentsRes: { data: [] },
};

export async function fetchDashboardRawData(userIds: string[], monthStartStr: string): Promise<DashboardRawData> {
  const result = await dalRead(
    `dashboard:raw:${userIds.slice().sort().join(',')}:${monthStartStr}`,
    async () => {
      const [customersRes, policiesRes, installmentsRes, paymentsRes] = await Promise.all([
        supabase.from('customers').select('id', { count: 'exact', head: true }).in('owner_id', userIds),
        supabase.from('policies').select('id, status, owner_id').in('owner_id', userIds),
        supabase
          .from('installments')
          .select('id, amount, due_date, status, is_first, policy:policy_id(owner_id)')
          .in('status', ['pending', 'overdue']),
        supabase
          .from('payments')
          .select('id, amount, payment_month, is_cancelled, installment:installment_id(is_first, policy:policy_id(owner_id))')
          .eq('payment_month', monthStartStr)
          .eq('is_cancelled', false),
      ]);

      if (customersRes.error) throw customersRes.error;
      if (policiesRes.error) throw policiesRes.error;
      if (installmentsRes.error) throw installmentsRes.error;
      if (paymentsRes.error) throw paymentsRes.error;

      return {
        customersRes: { data: customersRes.data, count: customersRes.count },
        policiesRes: { data: policiesRes.data },
        installmentsRes: { data: installmentsRes.data },
        paymentsRes: { data: paymentsRes.data },
      };
    },
    { emptyValue: EMPTY_DASHBOARD_RAW },
  );
  return result.data;
}

export async function fetchTeamUsers(userIds: string[]) {
  const result = await dalRead(
    `dashboard:teamUsers:${userIds.slice().sort().join(',')}`,
    async () => {
      const { data, error } = await supabase
        .from('users')
        .select('id, name, role, target, manager_id, is_active')
        .in('id', userIds);
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );
  return result.data;
}

export async function fetchMonthPayments(monthStartStr: string) {
  const result = await dalRead(
    `dashboard:monthPayments:${monthStartStr}`,
    async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('amount, installment:installment_id(is_first, policy:policy_id(owner_id))')
        .eq('payment_month', monthStartStr)
        .eq('is_cancelled', false);
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );
  return result.data;
}

export async function fetchMonthPaymentsWithFirstFlag(monthStartStr: string) {
  return fetchMonthPayments(monthStartStr);
}

export const getCurrentMonthStartStr = () => format(startOfMonth(new Date()), 'yyyy-MM-dd');

// ===================================
// إحصائيات إضافية خاصة بالوكيل فقط (عدد العملاء وعدد الوثائق) — تُجلب فقط
// عند فتح تفاصيل وكيل معيّن داخل الـ Bottom Sheet (Lazy Loading)، وليست جزءًا
// من التحميل الأساسي للوحة التحكم حتى لا تبطئها.
export async function fetchAgentExtraStats(agentId: string): Promise<{ customersCount: number; policiesCount: number }> {
  const result = await dalRead(
    `dashboard:agentExtraStats:${agentId}`,
    async () => {
      const [customersRes, policiesRes] = await Promise.all([
        supabase.from('customers').select('id', { count: 'exact', head: true }).eq('owner_id', agentId),
        supabase.from('policies').select('id', { count: 'exact', head: true }).eq('owner_id', agentId),
      ]);
      if (customersRes.error) throw customersRes.error;
      if (policiesRes.error) throw policiesRes.error;
      return {
        customersCount: customersRes.count || 0,
        policiesCount: policiesRes.count || 0,
      };
    },
    { emptyValue: { customersCount: 0, policiesCount: 0 } },
  );
  return result.data;
}
