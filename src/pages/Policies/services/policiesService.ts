import { supabase, type Policy, type Customer } from '../../../lib/supabase';
import { format } from 'date-fns';
import type { PolicyFormData } from '../types';
import { withOfflineQueue } from '../../../lib/offlineQueue';
import { dalRead } from '../../../lib/dataAccessLayer';

const PAGE_SIZE = 10;

export interface FetchPoliciesParams {
  page: number;
  searchQuery: string;
  statusFilter: string;
  // نوع الوثيقة — 'all' يعني بدون فلترة (نفس منطق statusFilter تماماً)
  typeFilter?: string;
  // الشهر بصيغة yyyy-MM — يُطبَّق على تاريخ بداية الوثيقة (start_date)، 'all' يعني بدون فلترة
  monthFilter?: string;
  // الفرع الحالي المختار (BranchProvider العام) — فاضي/null يعني بدون فلترة
  // إضافية (وضع وظيفي واحد بس، السلوك القديم زي ما هو). لو موجود، بيقيّد
  // القائمة على وثائق الفرع ده بس، عن طريق عمود policies.branch_id الفعلي
  // (migration 060) — كل وثيقة مربوطة بفرع واحد ثابت.
  branchId?: string | null;
}

interface PoliciesPageResult {
  policies: Policy[];
  totalPages: number;
  totalCount: number;
}

const EMPTY_POLICIES_PAGE: PoliciesPageResult = { policies: [], totalPages: 1, totalCount: 0 };

export async function fetchPoliciesPage({
  page,
  searchQuery,
  statusFilter,
  typeFilter = 'all',
  monthFilter = 'all',
  branchId = null,
}: FetchPoliciesParams): Promise<PoliciesPageResult> {
  const cacheKey = `policies:page:${page}:${searchQuery.trim()}:${statusFilter}:${typeFilter}:${monthFilter}:${branchId ?? 'none'}`;

  const result = await dalRead(
    cacheKey,
    async () => {
      let query = supabase
        .from('policies')
        .select('*, customer:customer_id(*), owner:owner_id(id, name)', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (branchId) {
        query = query.eq('branch_id', branchId);
      }

      if (searchQuery.trim()) {
        // ملحوظة: Supabase/PostgREST لا يدعم الفلترة بـ or() مباشرة على عمود
        // من علاقة متداخلة (customer.name) — كان بيتم تجاهله بصمت فلا يطابق
        // شيء أبداً. الحل: نجيب أولاً أرقام العملاء المطابقين بالاسم أو الرقم
        // القومي أو رقم الهاتف، ثم نبحث بالـ or() بين رقم الوثيقة (مطابقة جزئية
        // تشمل تلقائياً آخر 6 أرقام لأنها بحث ضمن أي جزء من النص) أو أحد أرقام
        // العملاء دول.
        const term = searchQuery.trim();
        const { data: matchedCustomers } = await supabase
          .from('customers')
          .select('id')
          .or(`name.ilike.%${term}%,national_id.ilike.%${term}%,phone.ilike.%${term}%`);

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

      if (typeFilter !== 'all') {
        query = query.eq('policy_type', typeFilter);
      }

      if (monthFilter !== 'all') {
        const [y, m] = monthFilter.split('-').map(Number);
        const monthStart = format(new Date(y, m - 1, 1), 'yyyy-MM-dd');
        const monthEnd = format(new Date(y, m, 1), 'yyyy-MM-dd');
        query = query.gte('start_date', monthStart).lt('start_date', monthEnd);
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await query.range(from, to);
      if (error) throw error;

      return {
        policies: data as Policy[],
        totalPages: Math.ceil((count || 0) / PAGE_SIZE),
        totalCount: count || 0,
      };
    },
    { emptyValue: EMPTY_POLICIES_PAGE },
  );
  return result.data;
}

export interface PolicyStats {
  total: number;
  active: number;
  cancelled: number;
  issuedThisMonth: number;
}

// إحصائيات لحظية لأعلى الصفحة — كل رقم بيتحسب بمعزل عن أي فلاتر مطبقة على
// القائمة، ومقيّد تلقائياً بنفس صلاحيات RLS المطبقة على جدول policies
const EMPTY_POLICY_STATS: PolicyStats = { total: 0, active: 0, cancelled: 0, issuedThisMonth: 0 };

export async function fetchPolicyStats(branchId: string | null = null): Promise<PolicyStats> {
  const now = new Date();
  const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd');
  const monthEnd = format(new Date(now.getFullYear(), now.getMonth() + 1, 1), 'yyyy-MM-dd');

  const withBranch = (q: any) => (branchId ? q.eq('branch_id', branchId) : q);

  const result = await dalRead(
    `policies:stats:${monthStart}:${branchId ?? 'none'}`,
    async () => {
      const [totalRes, activeRes, cancelledRes, issuedRes] = await Promise.all([
        withBranch(supabase.from('policies').select('id', { count: 'exact', head: true })),
        withBranch(supabase.from('policies').select('id', { count: 'exact', head: true }).eq('status', 'active')),
        withBranch(supabase.from('policies').select('id', { count: 'exact', head: true }).eq('status', 'cancelled')),
        withBranch(
          supabase
            .from('policies')
            .select('id', { count: 'exact', head: true })
            .gte('created_at', monthStart)
            .lt('created_at', monthEnd)
        ),
      ]);

      if (totalRes.error) throw totalRes.error;
      if (activeRes.error) throw activeRes.error;
      if (cancelledRes.error) throw cancelledRes.error;
      if (issuedRes.error) throw issuedRes.error;

      return {
        total: totalRes.count || 0,
        active: activeRes.count || 0,
        cancelled: cancelledRes.count || 0,
        issuedThisMonth: issuedRes.count || 0,
      };
    },
    { emptyValue: EMPTY_POLICY_STATS },
  );
  return result.data;
}

export async function fetchPolicyById(id: string): Promise<Policy> {
  const result = await dalRead(
    `policies:byId:${id}`,
    async () => {
      const { data, error } = await supabase
        .from('policies')
        .select('*, customer:customer_id(*), owner:owner_id(id, name)')
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as Policy;
    },
    { emptyValue: null as unknown as Policy },
  );
  if (!result.data) throw new Error('تعذر تحميل بيانات الوثيقة');
  return result.data;
}

// ملحوظة: العميل ممكن يكون له أكتر من وثيقة فى نفس الوقت، فالقائمة بترجع كل
// العملاء (فى حدود صلاحيات RLS) بدون استبعاد اللى عندهم وثيقة بالفعل.
// includeCustomerId اتسابت فى التوقيع لتوافق نداءات الصفحة الحالية، وبقت
// بدون تأثير عملي بعد إلغاء الاستبعاد.
export async function fetchCustomersForDropdown(_includeCustomerId?: string): Promise<Customer[]> {
  const result = await dalRead(
    'policies:customersDropdown',
    async () => {
      const { data: customersData, error: customersError } = await supabase
        .from('customers')
        .select('id, name, owner_id')
        .order('name');
      if (customersError) throw customersError;

      return (customersData as Customer[]) || [];
    },
    { emptyValue: [] as Customer[] },
  );
  return result.data;
}

// شكل بيانات العميل المستخدم فى نافذة اختيار العميل داخل نموذج إصدار الوثيقة
export interface CustomerPickerItem {
  id: string;
  name: string;
  phone?: string;
  national_id?: string;
  owner_id: string;
  owner_name?: string;
  created_at: string;
  // رقم أحدث وثيقة للعميل (إن وجدت) — لعرضها فقط، بدون أي تأثير على منطق الإصدار
  current_policy_number?: string;
  // بيانات "طلب التأمين" المسجلة مع العميل — تُستخدم لتعبئة مبلغ التأمين
  // وطريقة السداد تلقائياً وقفلهما عند إصدار وثيقة جديدة له (usePolicyActions)
  insurance_amount?: number;
  payment_method?: string;
}

const CUSTOMER_PICKER_RESULT_LIMIT = 30;

// يجيب أحدث وثيقة لكل عميل من مجموعة أرقام عملاء — يُستخدم فقط لعرض "رقم
// الوثيقة الحالية" فى نافذة اختيار العميل، ومفيهوش أي تأثير على منطق الإصدار
async function fetchLatestPolicyNumbersByCustomer(customerIds: string[]): Promise<Map<string, string>> {
  if (customerIds.length === 0) return new Map<string, string>();

  const result = await dalRead(
    `policies:latestNumbersByCustomer:${customerIds.slice().sort().join(',')}`,
    async () => {
      const { data, error } = await supabase
        .from('policies')
        .select('customer_id, policy_number, created_at')
        .in('customer_id', customerIds)
        .order('created_at', { ascending: false });

      if (error) throw error;

      const map: Record<string, string> = {};
      for (const row of (data as any[]) || []) {
        if (!map[row.customer_id]) {
          map[row.customer_id] = row.policy_number;
        }
      }
      return map;
    },
    { emptyValue: {} as Record<string, string> },
  );
  return new Map(Object.entries(result.data));
}

// بحث لحظي عن العملاء لنافذة اختيار العميل داخل نموذج إصدار الوثيقة — يبحث فى
// الاسم/الهاتف/الرقم القومي، ومرتّب دائماً من الأحدث إضافةً للأقدم، ومحدود
// بعدد نتائج معقول (بدل تحميل آلاف العملاء دفعة واحدة) للحفاظ على الأداء
export async function searchCustomersForPicker(searchTerm: string): Promise<CustomerPickerItem[]> {
  const term = searchTerm.trim();

  const result = await dalRead(
    `policies:customerPicker:search:${term}`,
    async () => {
      let query = supabase
        .from('customers')
        .select('id, name, phone, national_id, owner_id, created_at, insurance_amount, payment_method, owner:owner_id(name)')
        .order('created_at', { ascending: false })
        .limit(CUSTOMER_PICKER_RESULT_LIMIT);

      if (term) {
        query = query.or(
          `name.ilike.%${term}%,phone.ilike.%${term}%,national_id.ilike.%${term}%`
        );
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data as any[]) || [];
    },
    { emptyValue: [] as any[] },
  );

  const customersData = result.data;
  const customerIds = customersData.map((c) => c.id);
  const latestPolicyByCustomer = await fetchLatestPolicyNumbersByCustomer(customerIds);

  return customersData.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone || undefined,
    national_id: c.national_id || undefined,
    owner_id: c.owner_id,
    owner_name: c.owner?.name,
    created_at: c.created_at,
    current_policy_number: latestPolicyByCustomer.get(c.id),
    insurance_amount: c.insurance_amount ?? undefined,
    payment_method: c.payment_method ?? undefined
  }));
}

// بيانات عميل واحد بنفس شكل نافذة اختيار العميل — تُستخدم لعرض العميل
// المُثبَّت مسبقاً (تعديل وثيقة، أو دخول من صفحة العميل) بدون تحميل القائمة كاملة
export async function fetchCustomerForPicker(customerId: string): Promise<CustomerPickerItem | null> {
  const result = await dalRead(
    `policies:customerPicker:byId:${customerId}`,
    async () => {
      const { data, error } = await supabase
        .from('customers')
        .select('id, name, phone, national_id, owner_id, created_at, insurance_amount, payment_method, owner:owner_id(name)')
        .eq('id', customerId)
        .maybeSingle();

      if (error) throw error;
      return data;
    },
    { emptyValue: null as any },
  );
  const data = result.data;
  if (!data) return null;

  const latestPolicyByCustomer = await fetchLatestPolicyNumbersByCustomer([data.id]);

  return {
    id: data.id,
    name: data.name,
    phone: (data as any).phone || undefined,
    national_id: (data as any).national_id || undefined,
    owner_id: (data as any).owner_id,
    owner_name: (data as any).owner?.name,
    created_at: (data as any).created_at,
    current_policy_number: latestPolicyByCustomer.get(data.id),
    insurance_amount: (data as any).insurance_amount ?? undefined,
    payment_method: (data as any).payment_method ?? undefined
  };
}

export async function countPaidInstallments(policyId: string): Promise<number> {
  const result = await dalRead(
    `policies:paidInstallmentsCount:${policyId}`,
    async () => {
      const { count, error } = await supabase
        .from('installments')
        .select('id', { count: 'exact', head: true })
        .eq('policy_id', policyId)
        .eq('status', 'paid');
      if (error) throw error;
      return count || 0;
    },
    { emptyValue: 0 },
  );
  return result.data;
}

// نستخدم دالة update_policy_op الموجودة بالفعل: بتعمل التحديث وتسجيل النشاط
// جوه معاملة واحدة، ومحمية بمفتاح idempotency. بنمرر p_expected_updated_at
// كـ NULL عمداً للحفاظ على نفس السلوك الحالي بالضبط (بدون فحص تعارض تعديل
// متزامن لم يكن موجوداً من قبل).
export async function updatePolicy(policyId: string, data: PolicyFormData, oldData: Policy): Promise<void> {
  const { isEditingPolicy, ...policyData } = data;
  const { data: result, error } = await supabase.rpc('update_policy_op', {
    p_operation_id: crypto.randomUUID(),
    p_policy_id: policyId,
    p_expected_updated_at: null,
    p_policy_number: policyData.policy_number,
    p_customer_id: policyData.customer_id,
    p_policy_type: policyData.policy_type,
    p_start_date: policyData.start_date,
    p_payment_method: policyData.payment_method,
    p_premium_amount: policyData.premium_amount,
    p_sum_assured: policyData.sum_assured ?? null,
    p_notes: policyData.notes || null,
  });

  if (error) throw error;

  const res = result as { error?: string } | null;
  if (res?.error) throw new Error(res.error);
}

// ownerId هنا هو مالك الوثيقة بمنطق العمل الحالي كما هو (نفس الوكيل صاحب
// العميل). createdByUserId هو المستخدم المسجل دخوله فعلياً الآن (قد يكون
// مديره فى حالة الإنشاء نيابة عنه) وتُستخدم فقط لربط عنصر طابور الأوفلاين
// بصاحبه الحقيقي - راجع نفس الملاحظة فى createCustomer.
export async function createPolicy(data: PolicyFormData, ownerId: string, createdByUserId: string): Promise<void> {
  const operationId = crypto.randomUUID();
  return withOfflineQueue(
    operationId,
    'add_policy',
    { data, ownerId },
    createdByUserId,
    (opId) => createPolicyOnline(data, ownerId, opId),
    undefined,
  );
}

// نستخدم دالة create_policy_op الموجودة بالفعل: بتعمل إنشاء الوثيقة، وتوليد
// الأقساط (generate_installments)، وتحديد الأقساط التاريخية كمسددة
// (mark_historical_installments_paid)، وتسجيل النشاط، كل ده جوه معاملة واحدة
// بدل ٣ نداءات منفصلة من الفرونت إند، ومحمية بمفتاح idempotency.
export async function createPolicyOnline(
  data: PolicyFormData,
  ownerId: string,
  operationId: string = crypto.randomUUID(),
): Promise<void> {
  const { isEditingPolicy, ...policyData } = data;
  const { data: result, error } = await supabase.rpc('create_policy_op', {
    p_operation_id: operationId,
    p_policy_number: policyData.policy_number,
    p_customer_id: policyData.customer_id,
    p_policy_type: policyData.policy_type,
    p_start_date: policyData.start_date,
    p_payment_method: policyData.payment_method,
    p_premium_amount: policyData.premium_amount,
    p_sum_assured: policyData.sum_assured ?? null,
    p_notes: policyData.notes || null,
    p_owner_id: ownerId,
  });

  if (error) throw error;

  const res = result as { error?: string; conflict?: boolean } | null;
  if (res?.error) {
    // نفس آلية اكتشاف "رقم الوثيقة مكرر" المستخدمة فى offlineSync
    // (isUniqueViolation بيفحص error.code === '23505')
    const err = new Error(res.error) as Error & { code?: string };
    if (res.conflict) err.code = '23505';
    throw err;
  }
}

export async function computeDeletablePolicyIds(policyList: Policy[]): Promise<Set<string>> {
  if (policyList.length === 0) return new Set();

  const policyIds = policyList.map((p) => p.id);
  const currentMonth = format(new Date(), 'yyyy-MM-01');

  const result = await dalRead(
    `policies:deletableIds:${currentMonth}:${policyIds.slice().sort().join(',')}`,
    async () => {
      // نجيب كل الدفعات الغير ملغاة المرتبطة بهذه الوثائق (عبر installments)
      const { data: installmentsData, error: instError } = await supabase
        .from('installments')
        .select('id, policy_id')
        .in('policy_id', policyIds);
      if (instError) throw instError;

      const installmentToPolicy = new Map<string, string>(
        (installmentsData || []).map((i: any) => [i.id, i.policy_id])
      );
      const installmentIds = (installmentsData || []).map((i: any) => i.id);

      const hasOldPaymentPolicyIds = new Set<string>();

      if (installmentIds.length > 0) {
        const { data: paymentsData, error: paymentsError } = await supabase
          .from('payments')
          .select('installment_id, payment_month')
          .in('installment_id', installmentIds)
          .eq('is_cancelled', false)
          .neq('payment_month', currentMonth);
        if (paymentsError) throw paymentsError;

        for (const p of paymentsData || []) {
          const policyId = installmentToPolicy.get((p as any).installment_id);
          if (policyId) hasOldPaymentPolicyIds.add(policyId);
        }
      }

      return policyIds.filter((id) => !hasOldPaymentPolicyIds.has(id));
    },
    { emptyValue: [] as string[] },
  );

  return new Set(result.data);
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

export async function changePolicyStatus(policy: Policy, newStatus: 'active' | 'cancelled'): Promise<void> {
  const updateData: any = {
    status: newStatus,
    updated_at: new Date().toISOString()
  };

  // لو الوثيقة كانت من سجلات قديمة بحالة "موقوف" (قبل إلغاء الميزة)، بنتأكد
  // من مسح أثر ذلك عند أي تغيير حالة جديد عليها
  if (newStatus === 'active') {
    updateData.suspended_at = null;
    updateData.suspended_reason = null;
  }

  // تسجيل تاريخ الإلغاء الفعلي — يُستخدم في حساب مؤشر "نسبة الإلغاءات"
  // (لا يؤثر على أي منطق آخر، مجرد ختم زمني إضافي)
  if (newStatus === 'cancelled') {
    updateData.cancelled_at = new Date().toISOString();
  } else if (newStatus === 'active' && policy.status === 'cancelled') {
    updateData.cancelled_at = null;
  }

  const { error } = await supabase
    .from('policies')
    .update(updateData)
    .eq('id', policy.id);

  if (error) throw error;

  const action = newStatus === 'cancelled' ? 'policy_cancel' : 'policy_reactivate';

  await supabase.rpc('log_activity', {
    p_action: action,
    p_entity_type: 'policy',
    p_entity_id: policy.id
  });
}
