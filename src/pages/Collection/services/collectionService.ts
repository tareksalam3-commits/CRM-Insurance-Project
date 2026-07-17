import { supabase, type User, type UserRole } from '../../../lib/supabase';
import { format, startOfMonth, endOfMonth, subMonths, startOfDay, endOfDay } from 'date-fns';
import type { QuickFilter, SubType, InstallmentWithRelations, OwnerFilter } from '../types';
import {
  fetchInstallmentsByPolicyId, payInstallment, cancelInstallmentPayment,
} from '../../../features/installments/installmentsService';
import { dalRead } from '../../../lib/dataAccessLayer';

const PAGE_SIZE = 10;

export interface FetchInstallmentsParams {
  quickFilter: QuickFilter;
  subType: SubType;
  ownerFilter: OwnerFilter;
  page: number;
  searchQuery: string;
}

// ===================================
// فريق المستخدم الحالي — لملء فلتر "الفريق" بأسماء حقيقية
// ===================================
// نفس الدالة المستخدمة أصلاً فى صفحة العملاء (fetchAgentsForCurrentUser):
// بترجع المستخدم نفسه + كل من هو تحته فى الهيكل الإداري فقط (get_user_subtree)،
// عشان كل درجة وظيفية تفلتر بأسماء فريقها الفعلي فقط (رئيس مجموعة يشوف
// وكلاءه، مراقب يشوف رؤساء مجموعاته، مدير تطوير يشوف كل من تحته... إلخ)
// بدل قائمة ثابتة من الأدوار تشمل كل مستخدمي النظام بغض النظر عن الهيكل.
export async function fetchTeamForCurrentUser(user: User): Promise<{ id: string; name: string; role: UserRole }[]> {
  if (user.role === 'agent' || user.role === 'premium_agent') {
    return [];
  }

  const result = await dalRead(
    `collection:team:${user.id}`,
    async () => {
      const { data: subtreeIds, error: subtreeError } = await supabase.rpc('get_user_subtree', {
        user_id: user.id,
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

      return [...(data || [])].sort((a, b) => {
        if (a.id === user.id) return -1;
        if (b.id === user.id) return 1;
        return a.name.localeCompare(b.name, 'ar');
      });
    },
    { emptyValue: [] as { id: string; name: string; role: UserRole }[] },
  );
  return result.data;
}

export interface FetchInstallmentsResult {
  installments: InstallmentWithRelations[];
  totalCount: number;
  totalPages: number;
}

// ===================================
// تحميل الأقساط — مُصحَّح
// ===================================
// تُستدعى مرة عند فتح صفحة التحصيل: تُلغي أي وثيقة (نشطة/موقوفة) عندها قسط
// غير مسدد فات على استحقاقه 3 شهور كاملة أو أكثر — قبل حساب فلتر "المتأخر"،
// عشان الوثائق دي تخرج من "المتأخر" أول ما توصل للحد ده مباشرة.
export async function cancelSeverelyOverduePolicies(): Promise<void> {
  const { error } = await supabase.rpc('cancel_severely_overdue_policies');
  if (error) throw error;
}

// البحث عن معرّفات الوثائق (policy_id) التي تطابق نص البحث في: رقم الوثيقة،
// اسم العميل، رقم الهاتف، الرقم القومي، أو اسم الوكيل (المسؤول عن الوثيقة).
// هذا امتداد لواجهة البحث فقط — لا يغيّر أي منطق حساب أو فلترة للتحصيل.
async function resolveSearchPolicyIds(searchQuery: string): Promise<string[] | null> {
  const q = searchQuery.trim();
  if (!q) return null;

  const [byNumber, byCustomer, byAgent] = await Promise.all([
    supabase.from('policies').select('id').ilike('policy_number', `%${q}%`),
    supabase.from('customers').select('id').or(`name.ilike.%${q}%,phone.ilike.%${q}%,national_id.ilike.%${q}%`),
    supabase.from('users').select('id').ilike('name', `%${q}%`),
  ]);

  const ids = new Set<string>();
  (byNumber.data || []).forEach((p) => ids.add(p.id));

  const customerIds = (byCustomer.data || []).map((c) => c.id);
  const agentIds = (byAgent.data || []).map((a) => a.id);

  const extraLookups: Promise<void>[] = [];
  if (customerIds.length) {
    extraLookups.push(
      Promise.resolve(
        supabase.from('policies').select('id').in('customer_id', customerIds)
      ).then(({ data }) => {
        (data || []).forEach((p) => ids.add(p.id));
      })
    );
  }
  if (agentIds.length) {
    extraLookups.push(
      Promise.resolve(
        supabase.from('policies').select('id').in('owner_id', agentIds)
      ).then(({ data }) => {
        (data || []).forEach((p) => ids.add(p.id));
      })
    );
  }
  await Promise.all(extraLookups);

  return Array.from(ids);
}

// البحث عن معرّفات الوثائق (policy_id) التي وكيلها (owner) هو الشخص المختار
// فى فلتر "الفريق" نفسه أو أي شخص تحته فى الهيكل الإداري (get_user_subtree
// الخاصة بالشخص المختار، مش المستخدم الحالي). بالطريقة دي اختيار رئيس مجموعة
// واحد بيجيب معاه تلقائياً مستحقات كل وكلائه، واختيار مراقب بيجيب معاه كل
// رؤساء المجموعات والوكلاء تحته... إلخ. يُستخدم فقط عند اختيار شخص محدد
// بخلاف "الكل" — لا يغيّر أي فلتر أو منطق حساب آخر.
async function resolveOwnerFilterPolicyIds(ownerFilter: OwnerFilter): Promise<string[]> {
  if (ownerFilter === 'all') return [];

  const { data: subtreeIds, error: subtreeError } = await supabase.rpc('get_user_subtree', {
    user_id: ownerFilter,
  });
  if (subtreeError) throw subtreeError;

  const ownerIds: string[] = subtreeIds && subtreeIds.length > 0 ? subtreeIds : [ownerFilter];

  const { data: policyRows, error: policyErr } = await supabase
    .from('policies')
    .select('id')
    .in('owner_id', ownerIds);
  if (policyErr) throw policyErr;

  return (policyRows || []).map((p) => p.id);
}

const EMPTY_INSTALLMENTS_RESULT: FetchInstallmentsResult = { installments: [], totalCount: 0, totalPages: 1 };

export async function fetchInstallments({ quickFilter, subType, ownerFilter, page, searchQuery }: FetchInstallmentsParams): Promise<FetchInstallmentsResult> {
  const cacheKey = `collection:installments:${quickFilter}:${subType}:${ownerFilter}:${page}:${searchQuery.trim()}`;

  const result = await dalRead(
    cacheKey,
    async () => {
      return fetchInstallmentsOnline({ quickFilter, subType, ownerFilter, page, searchQuery });
    },
    { emptyValue: EMPTY_INSTALLMENTS_RESULT },
  );
  return result.data;
}

async function fetchInstallmentsOnline({ quickFilter, subType, ownerFilter, page, searchQuery }: FetchInstallmentsParams): Promise<FetchInstallmentsResult> {
  const now        = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd   = endOfMonth(now);
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');
  const monthEndStr   = format(monthEnd,   'yyyy-MM-dd');

  // حدود فلتر "المتأخر": من شهر فات لحد شهرين فاتوا على تاريخ الاستحقاق
  // (شهر فات = يبدأ يظهر، شهرين = أقصى مدة، بعد كده تتلغي الوثيقة ولا يظهر
  // القسط هنا أصلاً - راجع cancelSeverelyOverduePolicies أعلاه)
  const overdueRangeStartStr = format(startOfMonth(subMonths(now, 2)), 'yyyy-MM-dd'); // بداية شهر -2 (أقصى مدة قبل الإلغاء)
  const overdueRangeEndExclusiveStr = format(startOfMonth(now), 'yyyy-MM-dd'); // بداية الشهر الحالي (أي قسط قبله يُعتبر "فاته شهر" على الأقل)

  const needsPaymentsJoin = quickFilter === 'paid';

  // !inner ضروري عشان نقدر نفلتر لاحقاً على policy.status أو payments.payment_month
  // (مسموح دايماً هنا لأن installments.policy_id مفتاح أجنبي إلزامي، فكل قسط له وثيقة مؤكد)
  let query = supabase
    .from('installments')
    .select(
      needsPaymentsJoin
        ? `*,
           policy:policy_id(
             *,
             customer:customer_id(name, phone, national_id),
             owner:owner_id(name)
           ),
           payments!inner(payment_month, is_cancelled)`
        : `*,
           policy:policy_id!inner(
             *,
             customer:customer_id(name, phone, national_id),
             owner:owner_id(name)
           )`,
      { count: 'exact' }
    );

  // ===== فلتر سريع (quickFilter) =====
  // نفس معايير الحساب الأصلية بالضبط (نفس المتغيرات الزمنية والحالات)، وكل
  // ما تغيّر هو تجميع تبويبي "الإنتاج الجديد" و"التحصيل الدوري" السابقين تحت
  // فلتر واحد ("الشهر" / "تم السداد")، مع إمكانية تضييقهما اختيارياً عبر
  // subType لو احتاج المستخدم يفرّق بينهما.
  switch (quickFilter) {
    case 'month':
      // كل قسط "مستحق" خلال الشهر الحالي (لسه معلّق) — إنتاج جديد + تحصيل دوري معاً
      query = query
        .eq('status', 'pending')
        .gte('due_date', monthStartStr)
        .lte('due_date', monthEndStr);
      break;
    case 'overdue':
      // بيُحسب مباشرة من تاريخ الاستحقاق (مش من عمود status المخزّن، لأنه
      // محتاج جدولة دورية مش متوفرة حالياً) — يعرض بس اللي فاته شهر لحد
      // شهرين، ويستبعد أي وثيقة اتلغت فعلاً (احتياطاً، رغم إننا بنلغيها قبل
      // النداء ده مباشرة في نفس تحميل الصفحة)
      query = query
        .eq('status', 'pending')
        .gte('due_date', overdueRangeStartStr)
        .lt('due_date', overdueRangeEndExclusiveStr)
        .neq('policy.status', 'cancelled');
      break;
    case 'paid':
      // مسدد فعلاً في الشهر الحالي تحديداً (حسب تاريخ السداد الفعلي payment_month
      // مش تاريخ الاستحقاق) — مش كل سداد تاريخي من أول ما الوثيقة اتعملت
      query = query
        .eq('status', 'paid')
        .eq('payments.payment_month', monthStartStr)
        .eq('payments.is_cancelled', false);
      break;
  }

  // فلتر فرعي اختياري: تحديد إنتاج جديد فقط أو تحصيل دوري فقط (نفس عمود
  // is_first المستخدم أصلاً في النظام، بدون أي تغيير في تفسيره)
  if (subType === 'new') {
    query = query.eq('is_first', true);
  } else if (subType === 'periodic') {
    query = query.eq('is_first', false);
  }

  // البحث الفوري — يغطي رقم الوثيقة، اسم العميل، رقم الهاتف، الرقم القومي،
  // واسم الوكيل. يتم حل معرّفات الوثائق المطابقة أولاً (Supabase لا يدعم
  // البحث المباشر عبر علاقات متداخلة بـ or())
  // البحث وفلتر "الفريق" مستقلان تمامًا عن بعضهما — تنفيذهما بالتوازي بدل
  // التسلسل يقلّل زمن الاستجابة دون أي تغيير فى النتيجة النهائية
  const [searchIds, ownerFilterIds] = await Promise.all([
    resolveSearchPolicyIds(searchQuery),
    ownerFilter !== 'all' ? resolveOwnerFilterPolicyIds(ownerFilter) : Promise.resolve(null),
  ]);

  let combinedIds: string[] | null = null;
  if (searchIds !== null && ownerFilterIds !== null) {
    const ownerFilterSet = new Set(ownerFilterIds);
    combinedIds = searchIds.filter((id) => ownerFilterSet.has(id));
  } else if (searchIds !== null) {
    combinedIds = searchIds;
  } else if (ownerFilterIds !== null) {
    combinedIds = ownerFilterIds;
  }

  if (combinedIds !== null) {
    if (combinedIds.length === 0) {
      return { installments: [], totalCount: 0, totalPages: 1 };
    }
    query = query.in('policy_id', combinedIds);
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
// بطاقات الإحصائيات السريعة أعلى الصفحة — قراءة فقط، لا تدخل في أي حساب
// تارجت أو محقق، وتخص السنة الأولى فقط (نفس فصل السنة الثانية القائم أصلاً)
// ===================================
export interface CollectionQuickStats {
  // "المستحق" — إجمالي الأقساط المستحقة (status='pending') خلال الشهر الحالي
  // بالكامل، بنفس منطق فلتر "الشهر" السريع أعلاه تماماً (بدون subType)،
  // وليس مستحقات اليوم فقط كما كانت سابقاً.
  dueMonthAmount: number;
  dueMonthCount: number;
  // "إجمالي المستحق" — كل الأقساط التي تاريخ استحقاقها خلال الشهر الحالي
  // بغض النظر عن حالتها (سواء لسه معلّقة/متأخرة أو تم سدادها بالفعل)، أي
  // dueMonthAmount نفسه + ما تم سداده فعلاً من أقساط هذا الشهر. تُستخدم
  // لعرض "المستحق X من إجمالي Y" أسفل بطاقة "المستحق".
  totalDueMonthAmount: number;
  collectedTodayAmount: number;
  collectedTodayCount: number;
  // "إجمالي المسدد خلال الشهر الحالي" — قيمة الأقساط التي تم سدادها فعلياً
  // خلال الشهر الحالي (حسب payment_month)، بنفس منطق فلتر "تم السداد" تماماً.
  collectedMonthAmount: number;
}

const EMPTY_COLLECTION_QUICK_STATS: CollectionQuickStats = {
  dueMonthAmount: 0,
  dueMonthCount: 0,
  totalDueMonthAmount: 0,
  collectedTodayAmount: 0,
  collectedTodayCount: 0,
  collectedMonthAmount: 0,
};

export async function fetchCollectionQuickStats(): Promise<CollectionQuickStats> {
  const now = new Date();
  const monthStart = startOfMonth(now);
  const monthEnd = endOfMonth(now);
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');
  const monthEndStr = format(monthEnd, 'yyyy-MM-dd');
  const dayStartIso = startOfDay(now).toISOString();
  const dayEndIso   = endOfDay(now).toISOString();

  const result = await dalRead(
    `collection:quickStats:${monthStartStr}:${format(now, 'yyyy-MM-dd')}`,
    async () => {
      const [dueRes, totalDueRes, collectedRes, collectedMonthRes] = await Promise.all([
        // نفس منطق فلتر "الشهر" السريع بالضبط: status='pending' وتاريخ الاستحقاق
        // خلال الشهر الحالي بالكامل (إنتاج جديد + تحصيل دوري معاً)
        supabase
          .from('installments')
          .select('amount', { count: 'exact' })
          .eq('status', 'pending')
          .gte('due_date', monthStartStr)
          .lte('due_date', monthEndStr),
        // نفس النطاق الزمني لكن بدون فلتر الحالة — كل قسط تاريخ استحقاقه هذا
        // الشهر سواء اتسدد أو لسه، عشان نحسب "إجمالي المستحق" الكلي للشهر
        supabase
          .from('installments')
          .select('amount')
          .gte('due_date', monthStartStr)
          .lte('due_date', monthEndStr),
        supabase
          .from('payments')
          .select('amount', { count: 'exact' })
          .eq('is_cancelled', false)
          .gte('paid_at', dayStartIso)
          .lte('paid_at', dayEndIso),
        // نفس منطق فلتر "تم السداد" بالضبط: مسدد فعلياً خلال الشهر الحالي حسب
        // تاريخ السداد الفعلي (payment_month) وليس تاريخ الاستحقاق
        supabase
          .from('payments')
          .select('amount')
          .eq('is_cancelled', false)
          .eq('payment_month', monthStartStr),
      ]);

      if (dueRes.error) throw dueRes.error;
      if (totalDueRes.error) throw totalDueRes.error;
      if (collectedRes.error) throw collectedRes.error;
      if (collectedMonthRes.error) throw collectedMonthRes.error;

      const dueMonthAmount = (dueRes.data || []).reduce((sum, r: any) => sum + Number(r.amount), 0);
      const totalDueMonthAmount = (totalDueRes.data || []).reduce((sum, r: any) => sum + Number(r.amount), 0);
      const collectedTodayAmount = (collectedRes.data || []).reduce((sum, r: any) => sum + Number(r.amount), 0);
      const collectedMonthAmount = (collectedMonthRes.data || []).reduce((sum, r: any) => sum + Number(r.amount), 0);

      return {
        dueMonthAmount,
        dueMonthCount: dueRes.count || 0,
        totalDueMonthAmount,
        collectedTodayAmount,
        collectedTodayCount: collectedRes.count || 0,
        collectedMonthAmount,
      };
    },
    { emptyValue: EMPTY_COLLECTION_QUICK_STATS },
  );
  return result.data;
}

// ===================================
// تحميل أقساط وثيقة معينة (مودال) — يفوّض مباشرة لنفس الدالة المشتركة
// المستخدمة فى صفحة تفاصيل الوثيقة وصفحة العملاء (بدون تكرار الاستعلام)
// ===================================
export async function fetchPolicyInstallments(policyId: string) {
  return fetchInstallmentsByPolicyId(policyId);
}

// ===================================
// تسجيل السداد وإلغاء السداد — مصدر واحد مشترك مع صفحة تفاصيل الوثيقة
// وصفحة العملاء (راجع src/features/installments/installmentsService.ts
// لنفس منطق العمل بالضبط، شامل إصلاح الوثائق القديمة)
// ===================================
export const processPayment = payInstallment;
export const cancelPayment = cancelInstallmentPayment;
