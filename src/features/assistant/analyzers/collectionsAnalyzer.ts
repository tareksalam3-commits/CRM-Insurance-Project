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
      const { data, error } = await supabase.rpc('assistant_scoped_payments', {
        p_paid_at_gte: todayStart,
        p_paid_at_lte: todayEnd,
      });
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );

  const collection = result.data.filter((p: any) => !p.is_first);
  const production = result.data.filter((p: any) => p.is_first);

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
      const { data, error } = await supabase.rpc('assistant_scoped_installments', { p_status: 'overdue' });
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );

  const byCustomer = new Map<string, { name: string; amount: number }>();
  result.data.forEach((i: any) => {
    const name = i.customer_name || 'غير معروف';
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
      const { data, error } = await supabase.rpc('assistant_scoped_installments', {
        p_status: 'pending',
        p_due_date: todayStr,
      });
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );

  return {
    title: '📅 مهام اليوم',
    lines:
      result.data.length === 0
        ? ['لا توجد أقساط مستحقة اليوم']
        : [
            `عدد الأقساط المستحقة: ${result.data.length}`,
            ...result.data.slice(0, 10).map((i: any) => `- ${i.customer_name || ''}: ${formatCurrency(Number(i.amount))}`)
          ]
  };
}
