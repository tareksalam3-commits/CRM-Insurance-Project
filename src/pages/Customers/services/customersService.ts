import { supabase, type Customer, type User, type PolicyStatus } from '../../../lib/supabase';
import { format } from 'date-fns';
import type { CustomerFormData, CustomerWithRelations } from '../types';
import { withOfflineQueue } from '../../../lib/offlineQueue';
import { dalRead } from '../../../lib/dataAccessLayer';
import { fetchUserSubtreeIdsBranchAware } from '../../../lib/branchHierarchy';

const PAGE_SIZE = 12;

// نطاق "الوكلاء" الخاص بفرع معيّن — لو branchId فاضي (وضع وظيفي واحد بس)
// بترجع null عمداً، وأي كود بيستخدمها لازم يتجاهل فلترة owner_id تمامًا فى
// هذه الحالة (نفس السلوك القديم بالكامل، معتمد على RLS العادي فقط). لو
// branchId موجود، بترجع نطاق (هو + فريقه) الخاص بنفس الفرع ده بس، ونستخدمها
// لتقييد كل استعلامات customers/policies/installments بعمود owner_id، عشان
// عملاء الفرع المختار بس هما اللي يظهروا (شامل عملاء "طلبات الإصدار" اللي
// لسه معندهمش أي وثيقة، ومش ممكن نفلترهم بعمود policies.branch_id).
async function getScopedOwnerIds(userId: string, branchId: string | null | undefined): Promise<string[] | null> {
  if (!branchId) return null;
  return fetchUserSubtreeIdsBranchAware('customers', userId, branchId);
}

export async function fetchAgentsForCurrentUser(user: User, branchId: string | null = null): Promise<any[]> {
  // لو المستخدم وكيل، مش محتاج يشوف قائمة وكلاء أصلاً (هيتسجل عليه تلقائياً)
  if (user.role === 'agent' || user.role === 'premium_agent') {
    return [];
  }

  const result = await dalRead(
    `customers:agentsList:${user.id}:${branchId ?? 'none'}`,
    async () => {
      // نجيب المستخدم الحالي + كل من هو تحته في الهيكل الإداري (فريقه) —
      // فى نطاق الفرع الحالي المختار لو موجود
      const allIds = await fetchUserSubtreeIdsBranchAware('customers', user.id, branchId);

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
    },
    { emptyValue: [] as any[] },
  );
  return result.data;
}

// ===== إحصائيات أعلى الصفحة =====

export interface CustomerStats {
  total: number;
  active: number;
  withDueInstallments: number;
  newThisMonth: number;
}

// عملاء لديهم وثيقة واحدة على الأقل بحالة "نشط" — نفس التعريف المستخدم فى
// كل من بطاقة الإحصائية وفلتر "حالة العميل" حتى تتطابق الأرقام دايماً
async function getActiveCustomerIds(ownerIds: string[] | null = null): Promise<string[]> {
  let query = supabase
    .from('policies')
    .select('customer_id')
    .eq('status', 'active');
  if (ownerIds) query = query.in('owner_id', ownerIds);
  const { data, error } = await query;
  if (error) throw error;
  return Array.from(new Set((data || []).map((p: any) => p.customer_id)));
}

// عملاء ليس لديهم أي وثيقة على الإطلاق — تُستخدم فى فلتر "طلبات الإصدار"
// الثابت أعلى قائمة العملاء (عملاء عندهم بيانات طلب تأمين لكن لسه محدش أصدر
// لهم وثيقة فعلية)
async function getCustomerIdsWithAnyPolicy(ownerIds: string[] | null = null): Promise<string[]> {
  let query = supabase
    .from('policies')
    .select('customer_id');
  if (ownerIds) query = query.in('owner_id', ownerIds);
  const { data, error } = await query;
  if (error) throw error;
  return Array.from(new Set((data || []).map((p: any) => p.customer_id)));
}

// عملاء لديهم قسط واحد على الأقل بحالة "متأخر" (نفس حالة overdue المحسوبة
// أصلاً فى قاعدة البيانات — لا تغيير فى منطق تحديد التأخير)
async function getCustomerIdsWithOverdueInstallments(ownerIds: string[] | null = null): Promise<string[]> {
  let query = supabase
    .from('installments')
    .select(ownerIds ? 'policy:policy_id!inner(customer_id, owner_id)' : 'policy:policy_id(customer_id)')
    .eq('status', 'overdue');
  if (ownerIds) query = query.in('policy.owner_id', ownerIds);
  const { data, error } = await query;
  if (error) throw error;

  const ids = new Set<string>();
  for (const row of data || []) {
    const customerId = (row as any).policy?.customer_id;
    if (customerId) ids.add(customerId);
  }
  return Array.from(ids);
}

// إحصائيات لحظية لأعلى الصفحة — كل رقم محسوب بمعزل عن أي فلاتر مطبقة على
// القائمة، ومقيّد تلقائياً بنفس صلاحيات RLS المطبقة على جداول customers/policies/installments
const EMPTY_CUSTOMER_STATS: CustomerStats = { total: 0, active: 0, withDueInstallments: 0, newThisMonth: 0 };

export async function fetchCustomerStats(userId: string, branchId: string | null = null): Promise<CustomerStats> {
  const now = new Date();
  const monthStart = format(new Date(now.getFullYear(), now.getMonth(), 1), 'yyyy-MM-dd');
  const monthEnd = format(new Date(now.getFullYear(), now.getMonth() + 1, 1), 'yyyy-MM-dd');

  const result = await dalRead(
    `customers:stats:${monthStart}:${branchId ?? 'none'}`,
    async () => {
      const ownerIds = await getScopedOwnerIds(userId, branchId);

      let totalQuery = supabase.from('customers').select('id', { count: 'exact', head: true });
      let newQuery = supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', monthStart)
        .lt('created_at', monthEnd);
      if (ownerIds) {
        totalQuery = totalQuery.in('owner_id', ownerIds);
        newQuery = newQuery.in('owner_id', ownerIds);
      }

      const [totalRes, newRes, activeIds, overdueIds] = await Promise.all([
        totalQuery,
        newQuery,
        getActiveCustomerIds(ownerIds),
        getCustomerIdsWithOverdueInstallments(ownerIds),
      ]);

      if (totalRes.error) throw totalRes.error;
      if (newRes.error) throw newRes.error;

      return {
        total: totalRes.count || 0,
        active: activeIds.length,
        withDueInstallments: overdueIds.length,
        newThisMonth: newRes.count || 0,
      };
    },
    { emptyValue: EMPTY_CUSTOMER_STATS },
  );
  return result.data;
}

// ===== قائمة العملاء (بحث + فلاتر + صفحات) =====

export interface FetchCustomersParams {
  page: number;
  searchQuery: string;
  statusFilter?: string; // 'all' | 'active' | 'inactive'
  agentFilter?: string;  // 'all' | <owner_id>
  monthFilter?: string;  // 'all' | 'yyyy-MM' (شهر تسجيل العميل)
  // فلتر ثابت "طلبات الإصدار": عملاء بدون أي وثيقة، بغض النظر عن حالة/فلتر
  // حالة العميل (statusFilter) — لو مفعّل بيتجاهل statusFilter تماماً
  noPolicyOnly?: boolean;
  // المستخدم الحالي + الفرع المختار (BranchProvider العام) — لازمين مع بعض
  // لحساب نطاق "الوكلاء" الخاص بالفرع ده (getScopedOwnerIds). branchId فاضي
  // = بدون فلترة إضافية (السلوك القديم، معتمد على RLS بس).
  userId?: string;
  branchId?: string | null;
}

interface CustomersPageResult {
  customers: CustomerWithRelations[];
  totalPages: number;
  totalCount: number;
}

const EMPTY_CUSTOMERS_PAGE: CustomersPageResult = { customers: [], totalPages: 1, totalCount: 0 };

export async function fetchCustomersPage({
  page,
  searchQuery,
  statusFilter = 'all',
  agentFilter = 'all',
  monthFilter = 'all',
  noPolicyOnly = false,
  userId,
  branchId = null,
}: FetchCustomersParams): Promise<CustomersPageResult> {
  const cacheKey = `customers:page:${page}:${searchQuery.trim()}:${statusFilter}:${agentFilter}:${monthFilter}:${noPolicyOnly ? 'req' : ''}:${branchId ?? 'none'}`;

  const result = await dalRead(
    cacheKey,
    async () => {
      const ownerIds = userId ? await getScopedOwnerIds(userId, branchId) : null;

      let query = supabase
        .from('customers')
        .select(
          '*, owner:owner_id(id, name), policies(id, policy_number, policy_type, premium_amount, sum_assured, start_date, status, created_at)',
          { count: 'exact' }
        )
        .order('created_at', { ascending: false });

      if (ownerIds) {
        query = query.in('owner_id', ownerIds);
      }

      if (searchQuery.trim()) {
        // ملحوظة: Supabase/PostgREST لا يدعم الفلترة بـ or() مباشرة على عمود من
        // علاقة متداخلة (رقم الوثيقة أو اسم الوكيل) — فبنجيب أولاً معرّفات
        // العملاء/الوكلاء المطابقين، ثم نضيفهم لشرط or() الأساسي
        const term = searchQuery.trim();

        const [{ data: matchedAgents }, { data: matchedPolicies }] = await Promise.all([
          supabase.from('users').select('id').ilike('name', `%${term}%`),
          supabase.from('policies').select('customer_id').ilike('policy_number', `%${term}%`),
        ]);

        const agentIds = (matchedAgents || []).map((a: any) => a.id);
        const policyCustomerIds = Array.from(
          new Set((matchedPolicies || []).map((p: any) => p.customer_id))
        );

        const orParts = [
          `name.ilike.%${term}%`,
          `national_id.ilike.%${term}%`,
          `phone.ilike.%${term}%`,
        ];
        if (agentIds.length) orParts.push(`owner_id.in.(${agentIds.join(',')})`);
        if (policyCustomerIds.length) orParts.push(`id.in.(${policyCustomerIds.join(',')})`);

        query = query.or(orParts.join(','));
      }

      if (noPolicyOnly) {
        // فلتر "طلبات الإصدار": عملاء ليس لهم أي وثيقة على الإطلاق، بترتيب
        // الأحدث أولاً دايماً (نفس ترتيب query الافتراضي created_at desc
        // أعلاه، بدون أي تغيير عليه)
        const idsWithPolicies = await getCustomerIdsWithAnyPolicy(ownerIds);
        if (idsWithPolicies.length > 0) {
          query = query.not('id', 'in', `(${idsWithPolicies.join(',')})`);
        }
      } else if (statusFilter === 'active' || statusFilter === 'inactive') {
        const activeIds = await getActiveCustomerIds(ownerIds);
        if (statusFilter === 'active') {
          if (activeIds.length === 0) {
            return { customers: [] as CustomerWithRelations[], totalPages: 1, totalCount: 0 };
          }
          query = query.in('id', activeIds);
        } else if (activeIds.length > 0) {
          query = query.not('id', 'in', `(${activeIds.join(',')})`);
        }
      }

      if (agentFilter && agentFilter !== 'all') {
        query = query.eq('owner_id', agentFilter);
      }

      if (monthFilter && monthFilter !== 'all') {
        const [y, m] = monthFilter.split('-').map(Number);
        const start = new Date(y, m - 1, 1);
        const end = new Date(y, m, 1);
        query = query.gte('created_at', start.toISOString()).lt('created_at', end.toISOString());
      }

      const from = (page - 1) * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;

      const { data, error, count } = await query.range(from, to);
      if (error) throw error;

      return {
        customers: (data || []) as CustomerWithRelations[],
        totalPages: Math.max(1, Math.ceil((count || 0) / PAGE_SIZE)),
        totalCount: count || 0,
      };
    },
    { emptyValue: EMPTY_CUSTOMERS_PAGE },
  );
  return result.data;
}

// أحدث وثيقة للعميل (حسب تاريخ بداية التأمين) — تُستخدم لعرض ملخص الوثيقة
// وحالة العميل داخل البطاقة، دون أي تعديل على منطق أو حالة الوثائق نفسها
export function getLatestPolicy(customer: CustomerWithRelations) {
  const policies = customer.policies || [];
  if (policies.length === 0) return null;
  return [...policies].sort(
    (a, b) => new Date(b.start_date).getTime() - new Date(a.start_date).getTime()
  )[0];
}

export function getCustomerPolicyStatus(customer: CustomerWithRelations): PolicyStatus | 'no_policy' {
  return getLatestPolicy(customer)?.status || 'no_policy';
}

// نستخدم دالة update_customer_op الموجودة بالفعل: بتعمل التحديث وتسجيل
// النشاط جوه معاملة واحدة، ومحمية بمفتاح idempotency. بنمرر
// p_expected_updated_at كـ NULL عمداً للحفاظ على نفس السلوك الحالي بالضبط
// (بدون أي فحص تعارض تعديل متزامن لم يكن موجوداً من قبل).
export async function updateCustomer(customerId: string, data: CustomerFormData, finalOwnerId: string | undefined, oldData: Customer): Promise<void> {
  const { isManagerRole, ...customerData } = data;
  const { data: result, error } = await supabase.rpc('update_customer_op', {
    p_operation_id: crypto.randomUUID(),
    p_customer_id: customerId,
    p_expected_updated_at: null,
    p_name: customerData.name,
    // الرقم القومي اختياري: لو اتسيب فاضي بنحفظه NULL بدل '' عشان قيد
    // UNIQUE في قاعدة البيانات يمنع التكرار للقيم الفعلية فقط، ومايمنعش
    // حفظ أكتر من عميل بدون رقم قومي.
    p_national_id: customerData.national_id?.trim() ? customerData.national_id.trim() : null,
    p_phone: customerData.phone || null,
    p_address: customerData.address || null,
    p_birth_date: customerData.birth_date || null,
    p_occupation: customerData.occupation || null,
    p_marital_status: customerData.marital_status || null,
    p_owner_id: finalOwnerId || oldData.owner_id,
    p_insurance_amount: customerData.insurance_amount ?? null,
    p_payment_method: customerData.payment_method || null,
    p_deposit_amount: customerData.deposit_amount ?? null,
  });

  if (error) throw error;

  const res = result as { error?: string } | null;
  if (res?.error) throw new Error(res.error);
}

// ملحوظة مهمة: finalOwnerId هنا هو "مالك السجل" (owner_id) بمنطق العمل الحالي
// كما هو تماماً (نفسه للوكيل، أو الوكيل المختار من فريقه لو مديره هو من ينشئ
// العميل). createdByUserId منفصل تماماً: هو هوية المستخدم المسجل دخوله فعلياً
// الآن ومَن أنشأ العملية، وتُستخدم فقط لربط عنصر طابور الأوفلاين بصاحبه
// الحقيقي (عشان مدير ينشئ عميل offline لوكيل تحته، والعملية تتزامن هو نفسه
// لما يرجع أونلاين - مش تنتظر دخول الوكيل نفسه على نفس الجهاز).
export async function createCustomer(data: CustomerFormData, finalOwnerId: string | undefined, createdByUserId: string): Promise<void> {
  if (!finalOwnerId) {
    return createCustomerOnline(data, finalOwnerId);
  }
  const operationId = crypto.randomUUID();
  return withOfflineQueue(
    operationId,
    'add_customer',
    { data, finalOwnerId },
    createdByUserId,
    (opId) => createCustomerOnline(data, finalOwnerId, opId),
    undefined,
  );
}

// نستخدم دالة create_customer_op الموجودة بالفعل: بتعمل الإضافة وتسجيل
// النشاط جوه معاملة واحدة، ومحمية بمفتاح idempotency (بيمنع إنشاء عميل
// مكرر لو نفس العملية اتعادت بعد انقطاع شبكة).
export async function createCustomerOnline(
  data: CustomerFormData,
  finalOwnerId: string | undefined,
  operationId: string = crypto.randomUUID(),
): Promise<void> {
  const { isManagerRole, ...customerData } = data;
  const { data: result, error } = await supabase.rpc('create_customer_op', {
    p_operation_id: operationId,
    p_name: customerData.name,
    p_national_id: customerData.national_id?.trim() ? customerData.national_id.trim() : null,
    p_phone: customerData.phone || null,
    p_address: customerData.address || null,
    p_birth_date: customerData.birth_date || null,
    p_occupation: customerData.occupation || null,
    p_marital_status: customerData.marital_status || null,
    p_owner_id: finalOwnerId,
    p_insurance_amount: customerData.insurance_amount ?? null,
    p_payment_method: customerData.payment_method || null,
    p_deposit_amount: customerData.deposit_amount ?? null,
  });

  if (error) throw error;

  const res = result as { error?: string; conflict?: boolean } | null;
  if (res?.error) {
    // نحافظ على نفس آلية اكتشاف "الرقم القومي مكرر" المستخدمة فى offlineSync
    // (isUniqueViolation بيفحص error.code === '23505')، رغم إن الخطأ هنا راجع
    // كـ jsonb من الدالة مش استثناء قاعدة بيانات مباشر.
    const err = new Error(res.error) as Error & { code?: string };
    if (res.conflict) err.code = '23505';
    throw err;
  }
}

export async function computeDeletableCustomerIds(customerList: Customer[]): Promise<Set<string>> {
  if (customerList.length === 0) return new Set();

  const customerIds = customerList.map((c) => c.id);
  const result = await dalRead(
    `customers:deletableIds:${customerIds.slice().sort().join(',')}`,
    async () => {
      const { data: policiesData, error } = await supabase
        .from('policies')
        .select('customer_id')
        .in('customer_id', customerIds);
      if (error) throw error;

      const idsWithPolicies = new Set((policiesData || []).map((p: any) => p.customer_id));
      return customerIds.filter((id) => !idsWithPolicies.has(id));
    },
    { emptyValue: [] as string[] },
  );
  return new Set(result.data);
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
