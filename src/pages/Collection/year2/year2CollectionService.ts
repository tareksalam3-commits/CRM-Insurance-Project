import { supabase } from '../../../lib/supabase';
import {
  format, startOfMonth, endOfMonth, subYears, subMonths, addYears,
  differenceInCalendarMonths,
  startOfQuarter, endOfQuarter, startOfYear, endOfYear,
} from 'date-fns';
import type { Year2Payment, Year2EligiblePolicy, Year2ReportRow, PrintPeriodType, Year2QuickFilter } from './types';
import { dalRead } from '../../../lib/dataAccessLayer';

const PAGE_SIZE = 10;

// ===================================================================
// كل الدوال هنا تتعامل حصرياً مع جدول year2_payments المنفصل — لا شيء
// هنا يقرأ من أو يكتب في installments أو payments (السنة الأولى)، ولا
// يُستخدم في أي تارجت/محقق/لوحة تحكم/تقارير أخرى بالنظام.
// ===================================================================

export interface FetchYear2PoliciesParams {
  page: number;
  searchQuery: string;
  // الفرع الحالي المختار (BranchProvider العام) — فاضي/null يعني بدون فلترة
  // إضافية (كل الفروع، معتمد على RLS بس) — تماماً بنفس مبدأ فلتر الفرع فى
  // تحصيلات السنة الأولى (collectionService.ts)، دون أي تأثير على طبيعة
  // عمل شاشة السنة الثانية أو عزلها عن باقي النظام.
  branchId?: string | null;
  // فلتر سريع: المستحق (لسه في انتظار تحصيل الشهر الحالي) / متأخر (فاته
  // شهر كامل أو أكثر بدون تحصيل) / تم السداد (اتحصّل فعلاً خلال الشهر
  // الحالي). نفس تسميات فلتر السنة الأولى تماماً — راجع الشرح أسفل
  // classifyYear2Status.
  quickFilter?: Year2QuickFilter;
}

export interface FetchYear2PoliciesResult {
  policies: Year2EligiblePolicy[];
  totalCount: number;
  totalPages: number;
}

const EMPTY_YEAR2_POLICIES: FetchYear2PoliciesResult = { policies: [], totalCount: 0, totalPages: 1 };

// ===================================================================
// تصنيف حالة وثيقة في تحصيلات السنة الثانية (مستحق / متأخر / تم السداد)
// ===================================================================
// بما إنه مفيش جدول جدولة أقساط منفصل للسنة الثانية (فقط سجل تحصيلات فعلية
// year2_payments)، بيتم بناء نفس مفهوم "الشهر المستحق" من تاريخ آخر تحصيل
// فعلي غير ملغى للوثيقة، وإلا فمن أول شهر استحقاق للسنة الثانية نفسها
// (سنة كاملة بعد start_date) لو لسه معهاش أي تحصيل. المعيار نفسه المستخدم
// فى فلتر "متأخر" بالسنة الأولى: فوات شهر كامل أو أكثر = متأخر.
function classifyYear2Status(startDate: string, lastPaidMonth: string | null, now: Date): Year2QuickFilter {
  const currentMonthStart = startOfMonth(now);
  const currentMonthStr = format(currentMonthStart, 'yyyy-MM-dd');

  if (lastPaidMonth === currentMonthStr) return 'paid';

  // أول شهر مستحق فعلياً للسنة الثانية = بداية الشهر اللي فيه سنة كاملة من
  // بداية الوثيقة (نفس شرط الأهلية fetchYear2EligiblePolicies، محسوب هنا
  // فقط عشان تحديد نقطة البداية لو لسه معهاش أي تحصيل)
  const firstDueMonth = startOfMonth(addYears(new Date(startDate), 1));
  const lastCoveredMonth = lastPaidMonth
    ? startOfMonth(new Date(lastPaidMonth))
    : subMonths(firstDueMonth, 1);

  const monthsBehind = differenceInCalendarMonths(currentMonthStart, lastCoveredMonth);
  return monthsBehind >= 2 ? 'overdue' : 'month';
}

// وثيقة تعتبر "دخلت السنة الثانية" فقط لو مر عليها سنة كاملة من start_date.
// أي وثيقة لسه في السنة الأولى (أقل من سنة) لا تظهر هنا إطلاقاً.
export async function fetchYear2EligiblePolicies(
  { page, searchQuery, branchId = null, quickFilter }: FetchYear2PoliciesParams
): Promise<FetchYear2PoliciesResult> {
  const oneYearAgoStr = format(subYears(new Date(), 1), 'yyyy-MM-dd');
  const nowStr = format(new Date(), 'yyyy-MM-dd');

  const result = await dalRead(
    `year2:eligiblePolicies:${page}:${searchQuery.trim()}:${oneYearAgoStr}:${branchId ?? 'none'}:${quickFilter ?? 'all'}:${nowStr}`,
    async () => {
      let baseQuery = supabase
        .from('policies')
        .select('*, customer:customer_id(name), owner:owner_id(name)')
        .lte('start_date', oneYearAgoStr);

      if (branchId) {
        baseQuery = baseQuery.eq('branch_id', branchId);
      }
      if (searchQuery.trim()) {
        baseQuery = baseQuery.ilike('policy_number', `%${searchQuery.trim()}%`);
      }

      let policies: Year2EligiblePolicy[];
      let totalCount: number;

      if (!quickFilter) {
        // بدون فلتر سريع: نفس المسار الأصلي (صفحة واحدة مباشرة من قاعدة
        // البيانات) — أسرع لأنه معتمد على قاعدة البيانات للـ pagination
        const from = (page - 1) * PAGE_SIZE;
        const to = from + PAGE_SIZE - 1;
        const { data, error, count } = await baseQuery
          .select('*, customer:customer_id(name), owner:owner_id(name)', { count: 'exact' })
          .order('start_date', { ascending: false })
          .range(from, to);

        if (error) throw error;
        policies = (data || []) as Year2EligiblePolicy[];
        totalCount = count || 0;
      } else {
        // مع فلتر سريع: الحالة (مستحق/متأخر/مسدد) محسوبة فى الجافاسكريبت
        // من آخر تحصيل فعلي، فلازم نجيب كل الوثائق المطابقة لفلاتر الفرع
        // والبحث أولاً (بدون range db-level)، نصنّفها، ثم نفلتر ونقسّم
        // الصفحات يدوياً — بنفس أسلوب fetchCollectionQuickStats بالسنة
        // الأولى (فلترة فى الجافاسكريبت بعد الجلب)
        const { data: allMatching, error: allError } = await baseQuery
          .order('start_date', { ascending: false });

        if (allError) throw allError;
        const candidates = (allMatching || []) as Year2EligiblePolicy[];

        if (candidates.length === 0) {
          policies = [];
          totalCount = 0;
        } else {
          const ids = candidates.map((p) => p.id);
          const { data: paymentsData, error: paymentsError } = await supabase
            .from('year2_payments')
            .select('policy_id, payment_month')
            .in('policy_id', ids)
            .eq('is_cancelled', false)
            .order('payment_month', { ascending: false });

          if (paymentsError) throw paymentsError;

          const lastPaidMonthByPolicy = new Map<string, string>();
          for (const p of paymentsData || []) {
            if (!lastPaidMonthByPolicy.has(p.policy_id)) {
              lastPaidMonthByPolicy.set(p.policy_id, p.payment_month);
            }
          }

          const now = new Date();
          const filtered = candidates.filter((policy) => {
            const status = classifyYear2Status(policy.start_date, lastPaidMonthByPolicy.get(policy.id) ?? null, now);
            return status === quickFilter;
          });

          totalCount = filtered.length;
          const from = (page - 1) * PAGE_SIZE;
          policies = filtered.slice(from, from + PAGE_SIZE);
        }
      }

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
        totalCount,
        totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)),
      };
    },
    { emptyValue: EMPTY_YEAR2_POLICIES },
  );
  return result.data;
}

// سجل تحصيلات السنة الثانية لوثيقة معينة
export async function fetchYear2Payments(policyId: string): Promise<Year2Payment[]> {
  const result = await dalRead(
    `year2:payments:${policyId}`,
    async () => {
      const { data, error } = await supabase
        .from('year2_payments')
        .select('*, paid_by:paid_by_user_id(name)')
        .eq('policy_id', policyId)
        .order('payment_date', { ascending: false });

      if (error) throw error;
      return (data as Year2Payment[]) || [];
    },
    { emptyValue: [] as Year2Payment[] },
  );
  return result.data;
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

export async function fetchYear2Report(
  periodType: PrintPeriodType,
  referenceDate: Date,
  branchId: string | null = null,
): Promise<Year2ReportRow[]> {
  const { start, end } = getPrintRange(periodType, referenceDate);

  const result = await dalRead(
    `year2:report:${periodType}:${start}:${end}:${branchId ?? 'none'}`,
    async () => {
      // فلتر الفرع هنا مبني على الوثيقة نفسها (policy.branch_id)، نفس مبدأ
      // فلتر الفرع فى تحصيلات السنة الأولى — !inner ضروري عشان نقدر نفلتر
      // على عمود من جدول مرتبط
      let query = supabase
        .from('year2_payments')
        .select(
          branchId
            ? `*, policy:policy_id!inner(*, customer:customer_id(name), owner:owner_id(name))`
            : `*, policy:policy_id(*, customer:customer_id(name), owner:owner_id(name))`
        )
        .eq('is_cancelled', false)
        .gte('payment_date', start)
        .lte('payment_date', end);

      if (branchId) {
        query = query.eq('policy.branch_id', branchId);
      }

      const { data, error } = await query.order('payment_date', { ascending: true });

      if (error) throw error;
      return (data as unknown as Year2ReportRow[]) || [];
    },
    { emptyValue: [] as Year2ReportRow[] },
  );
  return result.data;
}
