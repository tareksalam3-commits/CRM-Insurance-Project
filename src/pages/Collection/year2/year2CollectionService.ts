import { supabase } from '../../../lib/supabase';
import {
  format, startOfMonth, endOfMonth, subYears,
  startOfQuarter, endOfQuarter, startOfYear, endOfYear,
} from 'date-fns';
import type { Year2Payment, Year2EligiblePolicy, Year2ReportRow, PrintPeriodType } from './types';

const PAGE_SIZE = 10;

// ===================================================================
// كل الدوال هنا تتعامل حصرياً مع جدول year2_payments المنفصل — لا شيء
// هنا يقرأ من أو يكتب في installments أو payments (السنة الأولى)، ولا
// يُستخدم في أي تارجت/محقق/لوحة تحكم/تقارير أخرى بالنظام.
// ===================================================================

export interface FetchYear2PoliciesParams {
  page: number;
  searchQuery: string;
}

export interface FetchYear2PoliciesResult {
  policies: Year2EligiblePolicy[];
  totalCount: number;
  totalPages: number;
}

// وثيقة تعتبر "دخلت السنة الثانية" فقط لو مر عليها سنة كاملة من start_date.
// أي وثيقة لسه في السنة الأولى (أقل من سنة) لا تظهر هنا إطلاقاً.
export async function fetchYear2EligiblePolicies(
  { page, searchQuery }: FetchYear2PoliciesParams
): Promise<FetchYear2PoliciesResult> {
  const oneYearAgoStr = format(subYears(new Date(), 1), 'yyyy-MM-dd');

  let query = supabase
    .from('policies')
    .select('*, customer:customer_id(name), owner:owner_id(name)', { count: 'exact' })
    .lte('start_date', oneYearAgoStr);

  if (searchQuery.trim()) {
    query = query.ilike('policy_number', `%${searchQuery.trim()}%`);
  }

  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, error, count } = await query
    .order('start_date', { ascending: false })
    .range(from, to);

  if (error) throw error;

  const policies = (data || []) as Year2EligiblePolicy[];

  // إجمالي المحصل لكل وثيقة في السنة الثانية (استعلام واحد على الوثائق
  // المعروضة بالصفحة الحالية فقط)
  if (policies.length > 0) {
    const ids = policies.map((p) => p.id);
    const { data: paymentsData, error: paymentsError } = await supabase
      .from('year2_payments')
      .select('policy_id, amount')
      .in('policy_id', ids)
      .eq('is_cancelled', false);

    if (paymentsError) throw paymentsError;

    const totals = new Map<string, number>();
    for (const p of paymentsData || []) {
      totals.set(p.policy_id, (totals.get(p.policy_id) || 0) + Number(p.amount));
    }
    for (const policy of policies) {
      policy.year2_total_paid = totals.get(policy.id) || 0;
    }
  }

  return {
    policies,
    totalCount: count || 0,
    totalPages: Math.ceil((count || 0) / PAGE_SIZE),
  };
}

// سجل تحصيلات السنة الثانية لوثيقة معينة
export async function fetchYear2Payments(policyId: string): Promise<Year2Payment[]> {
  const { data, error } = await supabase
    .from('year2_payments')
    .select('*, paid_by:paid_by_user_id(name)')
    .eq('policy_id', policyId)
    .order('payment_date', { ascending: false });

  if (error) throw error;
  return (data as Year2Payment[]) || [];
}

// تسجيل تحصيل سنة ثانية جديد
export async function addYear2Payment(
  policyId: string,
  amount: number,
  paymentDate: Date,
  userId: string,
  notes: string,
): Promise<void> {
  const paymentMonth = format(startOfMonth(paymentDate), 'yyyy-MM-dd');
  const paymentDateStr = format(paymentDate, 'yyyy-MM-dd');

  const { data, error } = await supabase
    .from('year2_payments')
    .insert({
      policy_id: policyId,
      amount,
      payment_date: paymentDateStr,
      payment_month: paymentMonth,
      paid_by_user_id: userId,
      notes: notes || null,
    })
    .select('id')
    .single();

  if (error) throw new Error(error.message || 'حدث خطأ أثناء تسجيل تحصيل السنة الثانية');

  await supabase.rpc('log_activity', {
    p_action: 'year2_payment_create',
    p_entity_type: 'year2_payment',
    p_entity_id: data?.id,
  });
}

// إلغاء تحصيل سنة ثانية
export async function cancelYear2Payment(
  payment: Year2Payment,
  userId: string,
  cancelReason: string,
): Promise<void> {
  const { error } = await supabase
    .from('year2_payments')
    .update({
      is_cancelled: true,
      cancelled_at: new Date().toISOString(),
      cancelled_by_user_id: userId,
      cancel_reason: cancelReason || 'إلغاء التحصيل',
    })
    .eq('id', payment.id);

  if (error) throw error;

  await supabase.rpc('log_activity', {
    p_action: 'year2_payment_cancel',
    p_entity_type: 'year2_payment',
    p_entity_id: payment.id,
  });
}

// ===================================================================
// تقرير الطباعة: شهر / ربع / سنة معينة — للمتابعة فقط، لا يدخل في أي
// حساب إحصائي آخر بالنظام
// ===================================================================
export function getPrintRange(periodType: PrintPeriodType, referenceDate: Date): { start: string; end: string; label: string } {
  let start: Date;
  let end: Date;
  let label: string;

  if (periodType === 'month') {
    start = startOfMonth(referenceDate);
    end = endOfMonth(referenceDate);
    label = format(referenceDate, 'MM/yyyy');
  } else if (periodType === 'quarter') {
    start = startOfQuarter(referenceDate);
    end = endOfQuarter(referenceDate);
    const quarterNumber = Math.floor(referenceDate.getMonth() / 3) + 1;
    label = `الربع ${quarterNumber} - ${format(referenceDate, 'yyyy')}`;
  } else {
    start = startOfYear(referenceDate);
    end = endOfYear(referenceDate);
    label = format(referenceDate, 'yyyy');
  }

  return {
    start: format(start, 'yyyy-MM-dd'),
    end: format(end, 'yyyy-MM-dd'),
    label,
  };
}

export async function fetchYear2Report(periodType: PrintPeriodType, referenceDate: Date): Promise<Year2ReportRow[]> {
  const { start, end } = getPrintRange(periodType, referenceDate);

  const { data, error } = await supabase
    .from('year2_payments')
    .select(`
      *,
      policy:policy_id(
        *,
        customer:customer_id(name),
        owner:owner_id(name)
      )
    `)
    .eq('is_cancelled', false)
    .gte('payment_date', start)
    .lte('payment_date', end)
    .order('payment_date', { ascending: true });

  if (error) throw error;
  return (data as Year2ReportRow[]) || [];
}
