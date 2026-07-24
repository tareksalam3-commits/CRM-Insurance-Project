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
      const { data, error } = await supabase.rpc('assistant_scoped_policies', {
        p_created_from: todayStart,
        p_created_to: todayEnd,
      });
      if (error) throw error;
      const sorted = (data || []).slice().sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1));
      return { data: sorted.slice(0, 10), count: sorted.length };
    },
    { emptyValue: { data: [] as any[], count: 0 } },
  );
  const { data, count } = result.data;

  return {
    title: '📄 الوثائق المضافة اليوم',
    lines:
      !data || data.length === 0
        ? ['لا توجد وثائق جديدة اليوم']
        : [
            `الإجمالي: ${count ?? data.length} وثيقة`,
            ...data.map((p: any) => `- ${p.policy_number} · ${p.customer_name || ''}`)
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
        supabase.rpc('assistant_scoped_payments', { p_payment_month: monthStartStr }),
        supabase.rpc('assistant_scoped_payments', { p_payment_month: prevMonthStartStr })
      ]);
      if (curRes.error) throw curRes.error;
      if (prevRes.error) throw prevRes.error;
      return { current: curRes.data || [], previous: prevRes.data || [] };
    },
    { emptyValue: { current: [] as any[], previous: [] as any[] } },
  );

  const sumProduction = (rows: any[]) =>
    rows.filter((p) => p.is_first).reduce((s, p) => s + Number(p.amount), 0);

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

/** اتجاه الإنتاج والتحصيل ووثائق جديدة على مدار آخر شهور (افتراضيًا 6) -
 * بترجع رقم كل شهر لوحده عشان أي مقارنة بين أي شهرين أو أي مدة داخل
 * النطاق ده تبقى ممكنة من البيانات المرفقة مباشرة، من غير ما نحتاج نخمّن
 * مقدمًا المدة اللي المستخدم قاصدها بالظبط. */
export async function getMonthlyTrend(user: User, monthsBack = 6): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const now = new Date();
  const months = Array.from({ length: monthsBack }, (_, i) => startOfMonth(subMonths(now, monthsBack - 1 - i)));
  const monthStrs = months.map((m) => format(m, 'yyyy-MM-dd'));
  const rangeKey = `${monthStrs[0]}:${monthStrs[monthStrs.length - 1]}`;

  interface TrendRaw {
    paymentsByMonth: any[][];
    policiesByMonth: any[][];
  }

  const raw = await dalRead<TrendRaw>(
    `assistant:monthlyTrend:${userIds.slice().sort().join(',')}:${rangeKey}`,
    async () => {
      const paymentsResults = await Promise.all(
        monthStrs.map((m) => supabase.rpc('assistant_scoped_payments', { p_payment_month: m }))
      );
      const policiesResults = await Promise.all(
        months.map((m, i) => {
          const from = m.toISOString();
          const nextMonth = i + 1 < months.length ? months[i + 1] : startOfMonth(subMonths(now, -1));
          return supabase.rpc('assistant_scoped_policies', { p_created_from: from, p_created_to: nextMonth.toISOString() });
        })
      );
      paymentsResults.forEach((r) => {
        if (r.error) throw r.error;
      });
      policiesResults.forEach((r) => {
        if (r.error) throw r.error;
      });
      return {
        paymentsByMonth: paymentsResults.map((r) => r.data || []),
        policiesByMonth: policiesResults.map((r) => r.data || [])
      };
    },
    { emptyValue: { paymentsByMonth: monthStrs.map(() => []), policiesByMonth: monthStrs.map(() => []) } }
  ).then((r) => r.data);

  const rows = months.map((m, i) => {
    const payments = raw.paymentsByMonth[i] || [];
    const policies = raw.policiesByMonth[i] || [];
    const production = payments.filter((p: any) => p.is_first).reduce((s: number, p: any) => s + Number(p.amount), 0);
    const collection = payments.filter((p: any) => !p.is_first).reduce((s: number, p: any) => s + Number(p.amount), 0);
    const cancelled = policies.filter((p: any) => p.status === 'cancelled').length;
    return {
      label: format(m, 'MMMM yyyy', { locale: ar }),
      production,
      collection,
      newPolicies: policies.length,
      cancelled
    };
  });

  return {
    title: `📈 مقارنة آخر ${monthsBack} شهور (إنتاج / تحصيل / وثائق جديدة / إلغاءات)`,
    lines: rows.map(
      (r) =>
        `- ${r.label}: إنتاج ${formatCurrency(r.production)} | تحصيل ${formatCurrency(r.collection)} | وثائق جديدة ${r.newPolicies} | ملغاة ${r.cancelled}`
    )
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
      const { data, error } = await supabase.rpc('assistant_scoped_payments', {
        p_payment_month_gte: yearStartStr,
      });
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );

  const rows = result.data.filter((p: any) => p.is_first);
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
