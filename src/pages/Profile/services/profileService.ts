import { supabase } from '../../../lib/supabase';
import { format, startOfMonth, endOfMonth, startOfYear } from 'date-fns';
import { fetchCommissionSourceData } from '../../Commissions/services/commissionsService';
import { computeCommissionRows, computeSummary } from '../../Commissions/business/commissionsCalculator';
import type { ProfileFormData } from '../types';
import type { ProfilePerformanceStats } from '../types';
import { dalRead } from '../../../lib/dataAccessLayer';
import { fetchMyBranches } from '../../../lib/myBranches';
import { fetchUserSubtreeIdsBranchAware } from '../../../lib/branchHierarchy';
import type { UserRole } from '../../../lib/supabase';

// كل الأرقام هنا محسوبة لحظيًا من جداول Supabase الفعلية (payments, policies,
// customers) وقت فتح الصفحة، ومفيش أي قيمة مخزّنة أو Placeholder.
const EMPTY_PROFILE_STATS: ProfilePerformanceStats = {
  yearTotalPaid: 0,
  monthTotalPaid: 0,
  policiesThisYearCount: 0,
  activeCustomersCount: 0,
  commissionsThisMonth: 0,
};

export async function fetchProfilePerformanceStats(userId: string, role?: UserRole): Promise<ProfilePerformanceStats> {
  const today = new Date();
  const yearStartStr = format(startOfYear(today), 'yyyy-MM-dd');
  const monthStartStr = format(startOfMonth(today), 'yyyy-MM-dd');
  const monthEndStr = format(endOfMonth(today), 'yyyy-MM-dd');
  const todayStr = format(today, 'yyyy-MM-dd');

  const result = await dalRead(
    `profile:performanceStats:${userId}:${role ?? 'none'}:${todayStr}`,
    async () => {
      // التارجت الخاص بصاحب الدرجة الوظيفية (مراقب/مشرف/قائد مجموعة...) بيتحقق
      // بإنتاجه الشخصي + إنتاج فريقه معًا، فكل المؤشرات هنا (عدا العمولات)
      // بتتحسب على المستخدم نفسه + كل من هم تحته في الهيكل الوظيفي.
      //
      // مدير التطوير حالة خاصة: ممكن يدير أكتر من فرع (user_branch_roles)،
      // وتارجته أصلاً متحدد على أساس كل الفروع دي مجتمعة — فمينفعش نحسب
      // "نطاقه" بالهرم العام القديم (get_user_subtree) بس، لازم نجمع نطاق كل
      // فرع تحت إدارته (get_user_subtree_branch_aware لكل فرع من فروعه).
      let ownerIds: string[];
      if (role === 'development_manager') {
        const myBranches = await fetchMyBranches(userId);
        const perBranchIds = await Promise.all(
          myBranches.map((b) =>
            fetchUserSubtreeIdsBranchAware('profile:performanceStats', userId, b.branchId)
          )
        );
        const merged = new Set<string>([userId]);
        perBranchIds.forEach((ids) => ids.forEach((id) => merged.add(id)));
        ownerIds = Array.from(merged);
      } else {
        const { data: subtreeIds, error: subtreeError } = await supabase.rpc(
          'get_user_subtree',
          { user_id: userId }
        );
        if (subtreeError) throw subtreeError;
        ownerIds = (subtreeIds as string[] | null) || [userId];
      }

      // 1) كل الأقساط المسددة (غير الملغاة) الخاصة بوثائق المستخدم وفريقه من أول
      // السنة لغاية النهاردة — منها بنشتق "إجمالي المحقق هذا العام" و"نسبة
      // تحقيق الشهر الحالي"
      const { data: paymentsData, error: paymentsError } = await supabase
        .from('payments')
        .select('amount, payment_month, is_cancelled, installment:installment_id(policy:policy_id(owner_id))')
        .eq('is_cancelled', false)
        .gte('payment_month', yearStartStr)
        .lte('payment_month', todayStr);

      if (paymentsError) throw paymentsError;

      const ownerIdsSet = new Set(ownerIds);
      const teamPayments = ((paymentsData || []) as any[]).filter(
        (p) => p.installment?.policy?.owner_id && ownerIdsSet.has(p.installment.policy.owner_id)
      );

      const yearTotalPaid = teamPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const monthTotalPaid = teamPayments
        .filter((p) => p.payment_month >= monthStartStr && p.payment_month <= monthEndStr)
        .reduce((sum, p) => sum + Number(p.amount), 0);

      // 2) عدد الوثائق التي أصدرها المستخدم نفسه + كل من هم تحته في الهيكل
      // الوظيفي (نفس قاعدة الصلاحيات المستخدمة في باقي شاشات التطبيق)، مش
      // بس الإنتاج الشخصي
      const { count: policiesThisYearCount, error: policiesError } = await supabase
        .from('policies')
        .select('id', { count: 'exact', head: true })
        .in('owner_id', ownerIds)
        .gte('start_date', yearStartStr)
        .lte('start_date', todayStr);

      if (policiesError) throw policiesError;

      // 3) عدد العملاء "النشطين" = عدد العملاء المميزين اللي عندهم وثيقة واحدة
      // نشطة على الأقل، عند المستخدم أو أي فرد من فريقه (لا يوجد عمود حالة
      // مباشر في جدول customers)
      const { data: activePolicyCustomers, error: activeCustomersError } = await supabase
        .from('policies')
        .select('customer_id')
        .in('owner_id', ownerIds)
        .eq('status', 'active');

      if (activeCustomersError) throw activeCustomersError;

      const activeCustomersCount = new Set(
        (activePolicyCustomers || []).map((p: any) => p.customer_id)
      ).size;

      // 4) العمولات المستحقة هذا الشهر — عمولة شخصية بحتة (مش على الفريق)،
      // بنفس منطق حساب العمولات المستخدم في صفحة العمولات بالضبط، لضمان
      // تطابق الرقمين
      const targetMonth = format(today, 'yyyy-MM');
      const { year1Payments, year2Payments } = await fetchCommissionSourceData(userId, today);
      const { rows: commissionRows } = computeCommissionRows(year1Payments, year2Payments, targetMonth);
      const commissionsThisMonth = computeSummary(commissionRows).totalMonth;

      return {
        yearTotalPaid,
        monthTotalPaid,
        policiesThisYearCount: policiesThisYearCount || 0,
        activeCustomersCount,
        commissionsThisMonth,
      };
    },
    { emptyValue: EMPTY_PROFILE_STATS },
  );
  return result.data;
}

export async function updateProfile(userId: string, data: ProfileFormData): Promise<void> {
  const { error } = await supabase
    .from('users')
    .update({
      name: data.name,
      phone: data.phone,
      registration_number: data.registration_number,
      updated_at: new Date().toISOString()
    } as any)
    .eq('id', userId);

  if (error) throw error;
}

export async function changePassword(email: string, currentPassword: string, newPassword: string): Promise<{ error?: string }> {
  const { error: signInError } = await supabase.auth.signInWithPassword({
    email,
    password: currentPassword
  });

  if (signInError) {
    return { error: 'كلمة المرور الحالية غير صحيحة' };
  }

  const { error } = await supabase.auth.updateUser({
    password: newPassword
  });

  if (error) throw error;

  return {};
}

export async function uploadAvatar(userId: string, file: File): Promise<string> {
  const fileExt = file.name.split('.').pop();
  // Use fixed filename per user to overwrite old avatar
  const filePath = `avatars/${userId}.${fileExt}`;

  // Upload with upsert to overwrite existing file
  const { error: uploadError } = await supabase.storage
    .from('profiles')
    .upload(filePath, file, { upsert: true });

  if (uploadError) throw uploadError;

  const { data: { publicUrl } } = supabase.storage
    .from('profiles')
    .getPublicUrl(filePath);

  // Add cache-busting to force image refresh
  const urlWithTimestamp = `${publicUrl}?t=${Date.now()}`;

  const { error: updateError } = await supabase
    .from('users')
    .update({ avatar_url: urlWithTimestamp } as any)
    .eq('id', userId);

  if (updateError) throw updateError;

  return urlWithTimestamp;
}
