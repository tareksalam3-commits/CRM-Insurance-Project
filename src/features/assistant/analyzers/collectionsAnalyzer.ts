import { supabase, User } from '../../../lib/supabase';
import { startOfDay, endOfDay, format } from 'date-fns';
import { dalRead } from '../../../lib/dataAccessLayer';
import type { AssistantAnswer } from '../types';
import { formatCurrency } from '../helpers/formatters';
import { getScopedUserIds } from '../helpers/scopeHelpers';

/** التحصيل اليوم */
export async function getTodayCollection(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const todayStart = startOfDay(new Date()).toISOString();
  const todayEnd = endOfDay(new Date()).toISOString();

  const result = await dalRead(
    `assistant:todayCollection:${userIds.slice().sort().join(',')}:${format(new Date(), 'yyyy-MM-dd')}`,
    async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('amount, is_cancelled, installment:installment_id(is_first, policy:policy_id(owner_id))')
        .eq('is_cancelled', false)
        .gte('paid_at', todayStart)
        .lte('paid_at', todayEnd);
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );

  const filtered = result.data.filter((p: any) => userIds.includes(p.installment?.policy?.owner_id));
  const collection = filtered.filter((p: any) => !p.installment?.is_first);
  const production = filtered.filter((p: any) => p.installment?.is_first);

  return {
    title: '💰 التحصيل اليوم',
    lines: [
      `تحصيل دوري: ${formatCurrency(collection.reduce((s: number, p: any) => s + Number(p.amount), 0))} (${collection.length} عملية)`,
      `إنتاج جديد: ${formatCurrency(production.reduce((s: number, p: any) => s + Number(p.amount), 0))} (${production.length} عملية)`
    ]
  };
}

/** العملاء المتأخرون */
export async function getOverdueCustomers(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);

  const result = await dalRead(
    `assistant:overdueCustomers:${userIds.slice().sort().join(',')}`,
    async () => {
      const { data, error } = await supabase
        .from('installments')
        .select('amount, policy:policy_id(owner_id, customer:customer_id(name))')
        .eq('status', 'overdue');
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );

  const filtered = result.data.filter((i: any) => userIds.includes(i.policy?.owner_id));

  const byCustomer = new Map<string, { name: string; amount: number }>();
  filtered.forEach((i: any) => {
    const name = i.policy?.customer?.name || 'غير معروف';
    const existing = byCustomer.get(name) || { name, amount: 0 };
    existing.amount += Number(i.amount);
    byCustomer.set(name, existing);
  });

  const rows = Array.from(byCustomer.values()).sort((a, b) => b.amount - a.amount).slice(0, 10);

  return {
    title: '⚠️ العملاء المتأخرون',
    lines:
      rows.length === 0
        ? ['لا يوجد عملاء متأخرون حاليًا 🎉']
        : [`إجمالي العملاء المتأخرين: ${byCustomer.size}`, ...rows.map((r) => `- ${r.name}: ${formatCurrency(r.amount)}`)]
  };
}

/** مهام اليوم (الأقساط المستحقة اليوم) */
export async function getTodayTasks(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const result = await dalRead(
    `assistant:todayTasks:${userIds.slice().sort().join(',')}:${todayStr}`,
    async () => {
      const { data, error } = await supabase
        .from('installments')
        .select('amount, policy:policy_id(owner_id, customer:customer_id(name))')
        .eq('status', 'pending')
        .eq('due_date', todayStr);
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );

  const filtered = result.data.filter((i: any) => userIds.includes(i.policy?.owner_id));

  return {
    title: '📅 مهام اليوم',
    lines:
      filtered.length === 0
        ? ['لا توجد أقساط مستحقة اليوم']
        : [
            `عدد الأقساط المستحقة: ${filtered.length}`,
            ...filtered.slice(0, 10).map((i: any) => `- ${i.policy?.customer?.name || ''}: ${formatCurrency(Number(i.amount))}`)
          ]
  };
}
