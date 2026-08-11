// طبقة الوصول لبيانات لوحة إدارة الاشتراكات (Super Admin فقط) — مفصولة عن
// باقي خدمات المشروع، ومحمية أصلاً بصلاحيات RLS على مستوى قاعدة البيانات
import { supabase } from '../../../lib/supabase';
import type { SubscriptionStatus, SubscriptionPaymentRequestStatus, SubscriptionSettings } from '../types';
import { dalRead } from '../../../lib/dataAccessLayer';

export type SubscriptionScope = 'direct' | 'inherited' | 'missing';

interface SubscriptionRecord {
  id: string;
  user_id: string;
  status: SubscriptionStatus;
  is_trial_used: boolean;
  trial_end_date: string | null;
  duration_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
}

interface SubscriptionAdminUser {
  id: string;
  name: string;
  role: string;
  is_active: boolean;
  email: string;
  manager_id: string | null;
  deleted_at: string | null;
}

export interface AdminSubscriptionRow {
  id: string;
  user_id: string;
  status: SubscriptionStatus | null;
  is_trial_used: boolean;
  trial_end_date: string | null;
  duration_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  users: SubscriptionAdminUser | null;
  /** مباشر للمستخدم، أو موروث من مسؤول أعلى، أو غير مهيأ بعد. */
  subscription_scope: SubscriptionScope;
  subscription_owner: { id: string; name: string } | null;
}

/**
 * يعيد حالة الاشتراك لكل حساب غير محذوف، وليس فقط الحسابات التي لها صف مباشر
 * في جدول subscriptions. الوكلاء لا يحصلون عمداً على صف مستقل؛ لذلك نعرض لهم
 * اشتراك أقرب مسؤول أعلى منهم حتى يراهم السوبر أدمن وحالتهم الفعلية.
 */
export async function fetchAllSubscriptions(): Promise<AdminSubscriptionRow[]> {
  const result = await dalRead(
    `subscriptionsAdmin:allUsersSubscriptionStatus:v2`,
    async () => {
      const [subscriptionsResult, usersResult] = await Promise.all([
        supabase.from('subscriptions').select('*'),
        supabase
          .from('users')
          .select('id, name, role, is_active, email, manager_id, deleted_at')
          .order('name'),
      ]);

      if (subscriptionsResult.error) throw subscriptionsResult.error;
      if (usersResult.error) throw usersResult.error;

      const subscriptions = (subscriptionsResult.data || []) as unknown as SubscriptionRecord[];
      const users = (usersResult.data || []) as unknown as SubscriptionAdminUser[];
      const subscriptionsByUserId = new Map(subscriptions.map((subscription) => [subscription.user_id, subscription]));
      const usersById = new Map(users.map((user) => [user.id, user]));

      // نخفي الحسابات المحذوفة حذفاً ناعماً من القائمة، لكن تبقى في خريطة
      // السلسلة الهرمية حتى يطابق حساب الاشتراك الموروث منطق قاعدة البيانات.
      return users.filter((user) => !user.deleted_at).map((user): AdminSubscriptionRow => {
        const directSubscription = subscriptionsByUserId.get(user.id);
        if (directSubscription) {
          return {
            ...directSubscription,
            users: user,
            subscription_scope: 'direct',
            subscription_owner: { id: user.id, name: user.name },
          };
        }

        // الوكيل يرث الحالة من أقرب مدير أعلى يملك اشتراكاً مباشراً، بنفس منطق
        // get_my_subscription_lock_state في قاعدة البيانات.
        let currentManagerId = user.manager_id;
        let inheritedOwner: SubscriptionAdminUser | null = null;
        let inheritedSubscription: SubscriptionRecord | undefined;
        const visitedUserIds = new Set<string>([user.id]);

        while (currentManagerId && !visitedUserIds.has(currentManagerId)) {
          visitedUserIds.add(currentManagerId);
          const manager = usersById.get(currentManagerId);
          if (!manager) break;

          const managerSubscription = subscriptionsByUserId.get(manager.id);
          if (managerSubscription) {
            inheritedOwner = manager;
            inheritedSubscription = managerSubscription;
            break;
          }

          currentManagerId = manager.manager_id;
        }

        return {
          id: inheritedSubscription?.id || user.id,
          user_id: user.id,
          status: inheritedSubscription?.status || null,
          is_trial_used: inheritedSubscription?.is_trial_used || false,
          trial_end_date: inheritedSubscription?.trial_end_date || null,
          duration_id: inheritedSubscription?.duration_id || null,
          current_period_start: inheritedSubscription?.current_period_start || null,
          current_period_end: inheritedSubscription?.current_period_end || null,
          users: user,
          subscription_scope: inheritedSubscription ? 'inherited' : 'missing',
          subscription_owner: inheritedOwner ? { id: inheritedOwner.id, name: inheritedOwner.name } : null,
        };
      });
    },
    { emptyValue: [] as AdminSubscriptionRow[] },
  );
  return result.data;
}

export interface AdminPaymentRow {
  id: string;
  payer_user_id: string;
  included_user_ids: string[];
  duration_id: string;
  payment_method: string;
  amount_original: number;
  amount_final: number;
  receipt_url: string;
  reference_number: string | null;
  status: SubscriptionPaymentRequestStatus;
  rejection_reason: string | null;
  created_at: string;
  payer: { name: string; role: string } | null;
}

export async function fetchAllPaymentRequests(): Promise<AdminPaymentRow[]> {
  const result = await dalRead(
    `subscriptionsAdmin:allPaymentRequests`,
    async () => {
      const { data, error } = await supabase
        .from('subscription_payments')
        .select('*, payer:payer_user_id(name, role)')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data || []) as unknown as AdminPaymentRow[];
    },
    { emptyValue: [] as AdminPaymentRow[] },
  );
  return result.data;
}

export async function approvePayment(paymentId: string) {
  const { error } = await supabase.rpc('approve_subscription_payment', { p_payment_id: paymentId });
  if (error) throw error;
}

export async function rejectPayment(paymentId: string, reason: string) {
  const { error } = await supabase.rpc('reject_subscription_payment', {
    p_payment_id: paymentId,
    p_reason: reason
  });
  if (error) throw error;
}

export async function deletePaymentRequest(paymentId: string) {
  const { error } = await supabase.from('subscription_payments').delete().eq('id', paymentId);
  if (error) throw error;
}

export interface UserLookupRow {
  id: string;
  name: string;
  role: string;
}

// قائمة خفيفة لكل المستخدمين (اسم/درجة) — تستخدم لعرض أسماء التابعين
// المشمولين في طلب دفع من غير ما نكرر الاستعلام لكل طلب
export async function fetchUsersLookup(): Promise<UserLookupRow[]> {
  const result = await dalRead(
    `subscriptionsAdmin:usersLookup`,
    async () => {
      const { data, error } = await supabase.from('users').select('id, name, role');
      if (error) throw error;
      return (data || []) as UserLookupRow[];
    },
    { emptyValue: [] as UserLookupRow[] },
  );
  return result.data;
}

export interface ManualSubscriptionUpdate {
  status?: SubscriptionStatus;
  duration_id?: string | null;
  current_period_start?: string | null;
  current_period_end?: string | null;
  is_trial_used?: boolean;
  trial_end_date?: string | null;
}

// التحكم اليدوي الكامل لـ Super Admin (تفعيل/إيقاف/تمديد/تعديل تواريخ/منح مجاني/استرجاع تجربة)
// الكتابة مسموحة أصلاً لـ super_admin فقط عبر RLS على جدول subscriptions
export async function manualUpdateSubscription(userId: string, updates: ManualSubscriptionUpdate) {
  const { error } = await supabase.from('subscriptions').update(updates).eq('user_id', userId);
  if (error) throw error;

  await supabase.rpc('log_subscription_action', {
    p_action: 'manual_update',
    p_target_user_id: userId,
    p_payment_id: null,
    p_notes: JSON.stringify(updates)
  });
}

export type SubscriptionSettingsUpdate = Partial<
  Omit<SubscriptionSettings, 'id'>
>;

// تعديل إعدادات الاشتراكات العامة (تفعيل النظام، الفترة التجريبية، بيانات
// الدفع Instapay/Vodafone Cash) — مسموح لـ super_admin فقط عبر RLS على
// subscription_settings، ومن صفحة إدارة الاشتراكات فقط
export async function updateSubscriptionSettings(settingsId: string, updates: SubscriptionSettingsUpdate) {
  const { error } = await supabase.from('subscription_settings').update(updates).eq('id', settingsId);
  if (error) throw error;

  await supabase.rpc('log_subscription_action', {
    p_action: 'settings_update',
    p_target_user_id: null,
    p_payment_id: null,
    p_notes: JSON.stringify(updates)
  });
}

export interface AdminPlanPriceRow {
  id: string;
  role: string;
  duration_id: string;
  price: number;
  is_active: boolean;
}

// كل أسعار الخطط (بدون فلترة is_active) — عشان لوحة الإدارة تقدر تشوف
// وتعدّل حتى الخطط الموقوفة مؤقتاً
export async function fetchAllPlanPrices(): Promise<AdminPlanPriceRow[]> {
  const result = await dalRead(
    `subscriptionsAdmin:allPlanPrices`,
    async () => {
      const { data, error } = await supabase.from('subscription_plan_prices').select('*');
      if (error) throw error;
      return (data || []) as AdminPlanPriceRow[];
    },
    { emptyValue: [] as AdminPlanPriceRow[] },
  );
  return result.data;
}

// تعديل سعر خطة واحدة (درجة وظيفية × مدة اشتراك) — مسموح لـ super_admin فقط
// عبر RLS على subscription_plan_prices
export async function updatePlanPrice(priceId: string, updates: { price?: number; is_active?: boolean }) {
  const { error } = await supabase.from('subscription_plan_prices').update(updates).eq('id', priceId);
  if (error) throw error;

  await supabase.rpc('log_subscription_action', {
    p_action: 'plan_price_update',
    p_target_user_id: null,
    p_payment_id: null,
    p_notes: JSON.stringify({ price_id: priceId, ...updates })
  });
}
