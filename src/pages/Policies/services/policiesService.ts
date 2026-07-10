import { supabase, type Policy, type Customer } from '../../../lib/supabase';
import { format } from 'date-fns';
import type { PolicyFormData } from '../types';

const PAGE_SIZE = 10;

export interface FetchPoliciesParams {
  page: number;
  searchQuery: string;
  statusFilter: string;
}

export async function fetchPoliciesPage({ page, searchQuery, statusFilter }: FetchPoliciesParams) {
  let query = supabase
    .from('policies')
    .select('*, customer:customer_id(*), owner:owner_id(id, name)', { count: 'exact' })
    .order('created_at', { ascending: false });

  if (searchQuery.trim()) {
    // ملحوظة: Supabase/PostgREST لا يدعم الفلترة بـ or() مباشرة على عمود
    // من علاقة متداخلة (customer.name) — كان بيتم تجاهله بصمت فلا يطابق
    // شيء أبداً. الحل: نجيب أولاً أرقام العملاء المطابقين بالاسم، ثم نبحث
    // بالـ or() بين رقم الوثيقة أو أحد أرقام العملاء دول.
    const term = searchQuery.trim();
    const { data: matchedCustomers } = await supabase
      .from('customers')
      .select('id')
      .ilike('name', `%${term}%`);

    const customerIds = (matchedCustomers || []).map((c) => c.id);
    const orParts = [`policy_number.ilike.%${term}%`];
    if (customerIds.length > 0) {
      orParts.push(`customer_id.in.(${customerIds.join(',')})`);
    }
    query = query.or(orParts.join(','));
  }

  if (statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await query.range(from, to);
  if (error) throw error;

  return {
    policies: data as Policy[],
    totalPages: Math.ceil((count || 0) / PAGE_SIZE),
  };
}

export async function fetchPolicyById(id: string): Promise<Policy> {
  const { data, error } = await supabase
    .from('policies')
    .select('*, customer:customer_id(*), owner:owner_id(id, name)')
    .eq('id', id)
    .single();

  if (error) throw error;
  return data as Policy;
}

export async function fetchCustomersForDropdown(): Promise<Customer[]> {
  const { data } = await supabase
    .from('customers')
    .select('id, name, owner_id')
    .order('name');
  return data as Customer[];
}

export async function countPaidInstallments(policyId: string): Promise<number> {
  const { count } = await supabase
    .from('installments')
    .select('id', { count: 'exact', head: true })
    .eq('policy_id', policyId)
    .eq('status', 'paid');
  return count || 0;
}

export async function updatePolicy(policyId: string, data: PolicyFormData, oldData: Policy): Promise<void> {
  const { isEditingPolicy, ...policyData } = data;
  const { error } = await supabase
    .from('policies')
    .update({
      ...policyData,
      updated_at: new Date().toISOString()
    })
    .eq('id', policyId);

  if (error) throw error;

  await supabase.rpc('log_activity', {
    p_action: 'policy_update',
    p_entity_type: 'policy',
    p_entity_id: policyId,
    p_old_values: oldData,
    p_new_values: data
  });
}

export async function createPolicy(data: PolicyFormData, ownerId: string): Promise<void> {
  const { isEditingPolicy, ...policyData } = data;
  const { data: newPolicy, error } = await supabase
    .from('policies')
    .insert({
      ...policyData,
      owner_id: ownerId
    })
    .select()
    .single();

  if (error) throw error;

  if (newPolicy) {
    await supabase.rpc('generate_installments', {
      p_policy_id: newPolicy.id,
      p_start_date: data.start_date,
      p_payment_method: data.payment_method,
      p_premium_amount: data.premium_amount
    });

    await supabase.rpc('log_activity', {
      p_action: 'policy_create',
      p_entity_type: 'policy',
      p_entity_id: newPolicy.id
    });
  }
}

export async function computeDeletablePolicyIds(policyList: Policy[]): Promise<Set<string>> {
  if (policyList.length === 0) return new Set();

  const policyIds = policyList.map((p) => p.id);
  const currentMonth = format(new Date(), 'yyyy-MM-01');

  // نجيب كل الدفعات الغير ملغاة المرتبطة بهذه الوثائق (عبر installments)
  const { data: installmentsData } = await supabase
    .from('installments')
    .select('id, policy_id')
    .in('policy_id', policyIds);

  const installmentToPolicy = new Map<string, string>(
    (installmentsData || []).map((i: any) => [i.id, i.policy_id])
  );
  const installmentIds = (installmentsData || []).map((i: any) => i.id);

  const hasOldPaymentPolicyIds = new Set<string>();

  if (installmentIds.length > 0) {
    const { data: paymentsData } = await supabase
      .from('payments')
      .select('installment_id, payment_month')
      .in('installment_id', installmentIds)
      .eq('is_cancelled', false)
      .neq('payment_month', currentMonth);

    for (const p of paymentsData || []) {
      const policyId = installmentToPolicy.get((p as any).installment_id);
      if (policyId) hasOldPaymentPolicyIds.add(policyId);
    }
  }

  return new Set(policyIds.filter((id) => !hasOldPaymentPolicyIds.has(id)));
}

export async function deletePolicySafe(policyId: string, oldData: Policy): Promise<{ error?: string }> {
  const { error } = await supabase.rpc('delete_policy_safe', {
    p_policy_id: policyId
  });

  if (error) {
    if (error.message?.includes('دفعات مسددة من شهور سابقة')) {
      return { error: 'لا يمكن حذف هذه الوثيقة لوجود دفعات مسددة من شهور سابقة' };
    } else if (error.message?.includes('صلاحية')) {
      return { error: 'ليس لديك صلاحية لحذف هذه الوثيقة' };
    }
    throw error;
  }

  await supabase.rpc('log_activity', {
    p_action: 'policy_delete',
    p_entity_type: 'policy',
    p_entity_id: policyId,
    p_old_values: oldData
  });

  return {};
}

export async function changePolicyStatus(policy: Policy, newStatus: 'active' | 'suspended' | 'cancelled'): Promise<void> {
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
