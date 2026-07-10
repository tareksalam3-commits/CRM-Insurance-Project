import { supabase, type Customer, type User } from '../../../lib/supabase';
import type { CustomerFormData } from '../types';

const PAGE_SIZE = 10;

export async function fetchAgentsForCurrentUser(user: User): Promise<any[]> {
  // لو المستخدم وكيل، مش محتاج يشوف قائمة وكلاء أصلاً (هيتسجل عليه تلقائياً)
  if (user.role === 'agent' || user.role === 'premium_agent') {
    return [];
  }

  // نجيب المستخدم الحالي + كل من هو تحته في الهيكل الإداري (فريقه)
  const { data: subtreeIds, error: subtreeError } = await supabase.rpc('get_user_subtree', {
    user_id: user.id
  });
  if (subtreeError) throw subtreeError;

  const allIds: string[] = subtreeIds && subtreeIds.length > 0 ? subtreeIds : [user.id];

  const { data, error } = await supabase
    .from('users')
    .select('id, name, role')
    .in('id', allIds)
    .eq('is_active', true)
    .order('name');

  if (error) throw error;

  // نحط المدير نفسه أول واحد في القائمة، وبعده باقي الفريق
  return [...(data || [])].sort((a, b) => {
    if (a.id === user.id) return -1;
    if (b.id === user.id) return 1;
    return a.name.localeCompare(b.name, 'ar');
  });
}

export interface FetchCustomersParams {
  page: number;
  searchQuery: string;
}

export async function fetchCustomersPage({ page, searchQuery }: FetchCustomersParams) {
  let query = supabase
    .from('customers')
    .select('*, owner:owner_id(id, name)', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (searchQuery) {
    query = query.or(`name.ilike.%${searchQuery}%,national_id.ilike.%${searchQuery}%,phone.ilike.%${searchQuery}%`);
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  return {
    customers: data as Customer[],
    totalPages: Math.ceil((count || 0) / PAGE_SIZE),
  };
}

export async function updateCustomer(customerId: string, data: CustomerFormData, finalOwnerId: string | undefined, oldData: Customer): Promise<void> {
  const { isManagerRole, ...customerData } = data;
  const { error } = await supabase
    .from('customers')
    .update({
      ...customerData,
      // الرقم القومي اختياري: لو اتسيب فاضي بنحفظه NULL بدل '' عشان قيد
      // UNIQUE في قاعدة البيانات يمنع التكرار للقيم الفعلية فقط، ومايمنعش
      // حفظ أكتر من عميل بدون رقم قومي.
      national_id: customerData.national_id?.trim() ? customerData.national_id.trim() : null,
      owner_id: finalOwnerId || oldData.owner_id,
      updated_at: new Date().toISOString()
    })
    .eq('id', customerId);

  if (error) throw error;

  await supabase.rpc('log_activity', {
    p_action: 'customer_update',
    p_entity_type: 'customer',
    p_entity_id: customerId,
    p_old_values: oldData,
    p_new_values: data
  });
}

export async function createCustomer(data: CustomerFormData, finalOwnerId: string | undefined): Promise<void> {
  const { isManagerRole, ...customerData } = data;
  const { error } = await supabase
    .from('customers')
    .insert({
      ...customerData,
      national_id: customerData.national_id?.trim() ? customerData.national_id.trim() : null,
      owner_id: finalOwnerId
    });

  if (error) throw error;

  await supabase.rpc('log_activity', {
    p_action: 'customer_create',
    p_entity_type: 'customer'
  });
}

export async function computeDeletableCustomerIds(customerList: Customer[]): Promise<Set<string>> {
  if (customerList.length === 0) return new Set();

  const customerIds = customerList.map((c) => c.id);
  const { data: policiesData } = await supabase
    .from('policies')
    .select('customer_id')
    .in('customer_id', customerIds);

  const idsWithPolicies = new Set((policiesData || []).map((p: any) => p.customer_id));
  return new Set(customerIds.filter((id) => !idsWithPolicies.has(id)));
}

export async function deleteCustomer(id: string): Promise<{ error?: string }> {
  const { error } = await supabase
    .from('customers')
    .delete()
    .eq('id', id);

  if (error) {
    if (error.code === '42501' || error.code === '23503') {
      return { error: 'لا يمكن حذف هذا العميل لوجود وثائق مرتبطة به' };
    }
    throw error;
  }

  await supabase.rpc('log_activity', {
    p_action: 'customer_delete',
    p_entity_type: 'customer',
    p_entity_id: id
  });

  return {};
}
