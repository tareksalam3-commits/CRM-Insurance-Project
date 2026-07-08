import { supabase, type Policy } from '../../../lib/supabase';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import type { TabType, InstallmentWithRelations } from '../types';

const PAGE_SIZE = 10;

export interface FetchInstallmentsParams {
  activeTab: TabType;
  page: number;
  searchQuery: string;
}

export interface FetchInstallmentsResult {
  installments: InstallmentWithRelations[];
  totalCount: number;
  totalPages: number;
}

// ===================================
// تحميل الأقساط — مُصحَّح
// ===================================
export async function fetchInstallments({ activeTab, page, searchQuery }: FetchInstallmentsParams): Promise<FetchInstallmentsResult> {
  const now        = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd   = endOfMonth(now);
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');
  const monthEndStr   = format(monthEnd,   'yyyy-MM-dd');

  let query = supabase
    .from('installments')
    .select(
      `*,
       policy:policy_id(
         *,
         customer:customer_id(name),
         owner:owner_id(name)
       )`,
      { count: 'exact' }
    );

  // فلتر كل تاب
  switch (activeTab) {
    case 'new_production':
      query = query
        .eq('is_first', true)
        .eq('status', 'pending')
        .gte('due_date', monthStartStr)
        .lte('due_date', monthEndStr);
      break;
    case 'periodic':
      query = query
        .eq('is_first', false)
        .eq('status', 'pending')
        .gte('due_date', monthStartStr)
        .lte('due_date', monthEndStr);
      break;
    case 'overdue':
      query = query.eq('status', 'overdue');
      break;
    case 'paid_new':
      query = query
        .eq('is_first', true)
        .eq('status', 'paid');
      break;
    case 'paid_periodic':
      query = query
        .eq('is_first', false)
        .eq('status', 'paid');
      break;
  }

  // البحث بـ policy_id -> policy_number بدل or على nested relation
  // Supabase لا يدعم البحث المباشر على العلاقات بـ or()
  // الحل: نجيب policy_ids المطابقة أولاً ثم نفلتر
  if (searchQuery.trim()) {
    const { data: matchedPolicies } = await supabase
      .from('policies')
      .select('id')
      .ilike('policy_number', `%${searchQuery.trim()}%`);

    const ids = (matchedPolicies || []).map((p) => p.id);
    if (ids.length === 0) {
      // لا يوجد وثائق مطابقة
      return { installments: [], totalCount: 0, totalPages: 1 };
    }
    query = query.in('policy_id', ids);
  }

  const from = (page - 1) * PAGE_SIZE;
  const to   = from + PAGE_SIZE - 1;

  const { data, error, count } = await query
    .order('due_date', { ascending: true })
    .range(from, to);

  if (error) throw error;

  return {
    installments: (data as InstallmentWithRelations[]) || [],
    totalCount: count || 0,
    totalPages: Math.ceil((count || 0) / PAGE_SIZE),
  };
}

// ===================================
// تحميل أقساط وثيقة معينة (مودال)
// ===================================
export async function fetchPolicyInstallments(policyId: string): Promise<InstallmentWithRelations[]> {
  const { data, error } = await supabase
    .from('installments')
    .select(`
      *,
      policy:policy_id(
        *,
        customer:customer_id(name),
        owner:owner_id(name)
      )
    `)
    .eq('policy_id', policyId)
    .order('installment_number', { ascending: true });

  if (error) throw error;
  return (data as InstallmentWithRelations[]) || [];
}

// ===================================
// تسجيل السداد
// ===================================
export async function processPayment(installment: InstallmentWithRelations, userId: string): Promise<void> {
  const paymentMonth = format(startOfMonth(new Date()), 'yyyy-MM-dd');

  const { error } = await supabase
    .from('payments')
    .insert({
      installment_id:   installment.id,
      amount:           installment.amount,
      paid_by_user_id:  userId,
      payment_month:    paymentMonth,
    });

  if (error) throw error;

  await supabase.rpc('log_activity', {
    p_action:      'payment_create',
    p_entity_type: 'installment',
    p_entity_id:   installment.id,
  });
}

// ===================================
// إلغاء السداد
// ===================================
export async function cancelPayment(
  installment: InstallmentWithRelations,
  userId: string,
  cancelReason: string,
): Promise<{ error?: string }> {
  const paidAt     = installment.paid_at;
  const monthStart = format(startOfMonth(new Date(paidAt || new Date())), 'yyyy-MM-dd');

  // التحقق من الشهر المقفل
  const { data: isClosed } = await supabase.rpc('is_month_closed', {
    check_month: monthStart,
  });
  if (isClosed) {
    return { error: 'لا يمكن إلغاء السداد لشهر مقفل' };
  }

  const { data: payment } = await supabase
    .from('payments')
    .select('id')
    .eq('installment_id', installment.id)
    .eq('is_cancelled', false)
    .single();

  if (!payment) {
    return { error: 'لم يتم العثور على السداد' };
  }

  const { error } = await supabase
    .from('payments')
    .update({
      is_cancelled:           true,
      cancelled_at:           new Date().toISOString(),
      cancelled_by_user_id:   userId,
      cancel_reason:          cancelReason || 'إلغاء السداد',
    })
    .eq('id', payment.id);

  if (error) throw error;

  await supabase.rpc('log_activity', {
    p_action:      'payment_cancel',
    p_entity_type: 'installment',
    p_entity_id:   installment.id,
  });

  return {};
}
