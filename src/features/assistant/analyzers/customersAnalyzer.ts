import { supabase, User } from '../../../lib/supabase';
import { startOfDay, endOfDay, format } from 'date-fns';
import { dalRead } from '../../../lib/dataAccessLayer';
import type { AssistantAnswer } from '../types';
import { getScopedUserIds } from '../helpers/scopeHelpers';

/** العملاء الجدد اليوم */
export async function getTodayNewCustomers(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const todayStart = startOfDay(new Date()).toISOString();
  const todayEnd = endOfDay(new Date()).toISOString();

  const result = await dalRead(
    `assistant:todayNewCustomers:${userIds.slice().sort().join(',')}:${format(new Date(), 'yyyy-MM-dd')}`,
    async () => {
      const { data, count, error } = await supabase
        .from('customers')
        .select('name, phone', { count: 'exact' })
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
    title: '👥 العملاء الجدد اليوم',
    lines:
      !data || data.length === 0
        ? ['لا يوجد عملاء جدد اليوم']
        : [`الإجمالي: ${count ?? data.length} عميل`, ...data.map((c: any) => `- ${c.name}`)]
  };
}

/** عدد العملاء (الإجمالي الكلي، وليس فقط عملاء اليوم) */
export async function getCustomersCount(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);

  const result = await dalRead(
    `assistant:customersCount:${userIds.slice().sort().join(',')}`,
    async () => {
      const { count, error } = await supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .in('owner_id', userIds);
      if (error) throw error;
      return count ?? 0;
    },
    { emptyValue: 0 },
  );

  return {
    title: '👥 عدد العملاء',
    lines: [`إجمالي عدد العملاء: ${result.data}`]
  };
}

/** مراجعة جودة البيانات: بيانات ناقصة أو غير منطقية ضمن نطاق رؤية المستخدم */
export async function getDataQualityReview(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);

  const qualityRaw = await dalRead(
    `assistant:dataQuality:${userIds.slice().sort().join(',')}`,
    async () => {
      const [customersRes, policiesRes] = await Promise.all([
        supabase.from('customers').select('id, phone, national_id').in('owner_id', userIds),
        supabase.from('policies').select('id, customer_id, premium_amount').in('owner_id', userIds)
      ]);
      if (customersRes.error) throw customersRes.error;
      if (policiesRes.error) throw policiesRes.error;
      return { customers: customersRes.data || [], policies: policiesRes.data || [] };
    },
    { emptyValue: { customers: [] as any[], policies: [] as any[] } },
  );

  const customers = qualityRaw.data.customers;
  const policies = qualityRaw.data.policies;

  const missingPhone = customers.filter((c: any) => !c.phone).length;
  const missingNationalId = customers.filter((c: any) => !c.national_id).length;
  const customerIdsWithPolicies = new Set(policies.map((p: any) => p.customer_id));
  const customersWithoutPolicies = customers.filter((c: any) => !customerIdsWithPolicies.has(c.id)).length;
  const invalidPremium = policies.filter((p: any) => !p.premium_amount || Number(p.premium_amount) <= 0).length;

  const issues: string[] = [];
  if (missingPhone > 0) issues.push(`عملاء بدون رقم هاتف: ${missingPhone}`);
  if (missingNationalId > 0) issues.push(`عملاء بدون رقم قومي: ${missingNationalId}`);
  if (customersWithoutPolicies > 0) issues.push(`عملاء بدون أي وثيقة: ${customersWithoutPolicies}`);
  if (invalidPremium > 0) issues.push(`وثائق بقيمة قسط غير صحيحة: ${invalidPremium}`);

  return {
    title: '🔍 مراجعة جودة البيانات',
    lines: issues.length === 0 ? ['لا توجد مشاكل واضحة في جودة البيانات ضمن نطاقك 👍'] : issues
  };
}

/** توزيع العملاء بين أعضاء الفريق ضمن نطاق رؤية المستخدم */
export async function getCustomerDistribution(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);

  const distributionRaw = await dalRead(
    `assistant:customerDistribution:${userIds.slice().sort().join(',')}`,
    async () => {
      const [teamUsersRes, customersRes] = await Promise.all([
        supabase.from('users').select('id, name').in('id', userIds).eq('is_active', true),
        supabase.from('customers').select('owner_id').in('owner_id', userIds)
      ]);
      if (teamUsersRes.error) throw teamUsersRes.error;
      if (customersRes.error) throw customersRes.error;
      return { teamUsers: teamUsersRes.data || [], customers: customersRes.data || [] };
    },
    { emptyValue: { teamUsers: [] as any[], customers: [] as any[] } },
  );

  const counts = new Map<string, number>();
  distributionRaw.data.customers.forEach((c: any) => counts.set(c.owner_id, (counts.get(c.owner_id) || 0) + 1));

  const rows = distributionRaw.data.teamUsers
    .map((u: any) => ({ name: u.name, count: counts.get(u.id) || 0 }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 15);

  return {
    title: '👥 توزيع العملاء بين الفريق',
    lines: rows.length === 0 ? ['لا توجد بيانات كافية'] : rows.map((r) => `- ${r.name}: ${r.count} عميل`)
  };
}
