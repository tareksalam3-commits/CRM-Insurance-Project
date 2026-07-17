import { supabase, User } from '../../../lib/supabase';
import { startOfMonth, startOfDay, endOfDay, startOfYear, subMonths, format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { dalRead } from '../../../lib/dataAccessLayer';
import type { AssistantAnswer } from '../types';
import { formatCurrency } from '../helpers/formatters';
import { getScopedUserIds } from '../helpers/scopeHelpers';

/** الوثائق (بوالص التأمين) المضافة اليوم */
export async function getTodayNewPolicies(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const todayStart = startOfDay(new Date()).toISOString();
  const todayEnd = endOfDay(new Date()).toISOString();

  const result = await dalRead(
    `assistant:todayNewPolicies:${userIds.slice().sort().join(',')}:${format(new Date(), 'yyyy-MM-dd')}`,
    async () => {
      const { data, count, error } = await supabase
        .from('policies')
        .select('policy_number, premium_amount, customer:customer_id(name)', { count: 'exact' })
        .in('owner_id', userIds)
        .gte('created_at', todayStart)
        .lte('created_at', todayEnd)
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return { data: data || [], count };
    },
    { emptyValue: { data: [] as any[], count: 0 as number | null } },
  );
  const { data, count } = result.data;

  return {
    title: '📄 الوثائق المضافة اليوم',
    lines:
      !data || data.length === 0
        ? ['لا توجد وثائق جديدة اليوم']
        : [
            `الإجمالي: ${count ?? data.length} وثيقة`,
            ...data.map((p: any) => `- ${p.policy_number} · ${p.customer?.name || ''}`)
          ]
  };
}

/** الإنتاج الشهري (وثائق جديدة فقط) مقارنة بالشهر الماضي */
export async function getMonthlyProduction(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const now = new Date();
  const monthStartStr = format(startOfMonth(now), 'yyyy-MM-dd');
  const prevMonthStartStr = format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');

  const monthlyRaw = await dalRead(
    `assistant:monthlyProduction:${userIds.slice().sort().join(',')}:${monthStartStr}`,
    async () => {
      const [curRes, prevRes] = await Promise.all([
        supabase
          .from('payments')
          .select('amount, is_cancelled, installment:installment_id(is_first, policy:policy_id(owner_id))')
          .eq('payment_month', monthStartStr)
          .eq('is_cancelled', false),
        supabase
          .from('payments')
          .select('amount, is_cancelled, installment:installment_id(is_first, policy:policy_id(owner_id))')
          .eq('payment_month', prevMonthStartStr)
          .eq('is_cancelled', false)
      ]);
      if (curRes.error) throw curRes.error;
      if (prevRes.error) throw prevRes.error;
      return { current: curRes.data || [], previous: prevRes.data || [] };
    },
    { emptyValue: { current: [] as any[], previous: [] as any[] } },
  );

  const sumProduction = (rows: any[]) =>
    rows
      .filter((p) => userIds.includes(p.installment?.policy?.owner_id) && p.installment?.is_first)
      .reduce((s, p) => s + Number(p.amount), 0);

  const current = sumProduction(monthlyRaw.data.current);
  const previous = sumProduction(monthlyRaw.data.previous);
  const changeLine =
    previous > 0
      ? `${current >= previous ? '📈 زيادة' : '📉 انخفاض'} ${Math.abs(Math.round(((current - previous) / previous) * 100))}% عن الشهر الماضي`
      : 'لا توجد بيانات كافية من الشهر الماضي للمقارنة';

  return {
    title: '🏗️ الإنتاج الشهري',
    lines: [
      `إنتاج هذا الشهر (وثائق جديدة): ${formatCurrency(current)}`,
      `إنتاج الشهر الماضي: ${formatCurrency(previous)}`,
      changeLine
    ]
  };
}

/** الإنتاج السنوي (من بداية السنة الحالية) */
export async function getYearlyProduction(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const now = new Date();
  const yearStartStr = format(startOfYear(now), 'yyyy-MM-dd');

  const result = await dalRead(
    `assistant:yearlyProduction:${userIds.slice().sort().join(',')}:${yearStartStr}`,
    async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('amount, is_cancelled, payment_month, installment:installment_id(is_first, policy:policy_id(owner_id))')
        .eq('is_cancelled', false)
        .gte('payment_month', yearStartStr);
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );

  const rows = result.data.filter(
    (p: any) => userIds.includes(p.installment?.policy?.owner_id) && p.installment?.is_first
  );
  const total = rows.reduce((s: number, p: any) => s + Number(p.amount), 0);

  const byMonth = new Map<string, number>();
  rows.forEach((p: any) => {
    byMonth.set(p.payment_month, (byMonth.get(p.payment_month) || 0) + Number(p.amount));
  });
  const topMonths = Array.from(byMonth.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  return {
    title: '📆 الإنتاج السنوي',
    lines: [
      `إجمالي إنتاج ${format(now, 'yyyy')}: ${formatCurrency(total)}`,
      ...(topMonths.length > 0
        ? ['أفضل الشهور:', ...topMonths.map(([m, v]) => `- ${format(new Date(m), 'MMMM yyyy', { locale: ar })}: ${formatCurrency(v)}`)]
        : [])
    ]
  };
}
