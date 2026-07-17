// طبقة الوصول لبيانات لوحة إدارة الاشتراكات (Super Admin فقط) — مفصولة عن
// باقي خدمات المشروع، ومحمية أصلاً بصلاحيات RLS على مستوى قاعدة البيانات
import { supabase } from '../../../lib/supabase';
import type { SubscriptionStatus, SubscriptionPaymentRequestStatus, SubscriptionSettings } from '../types';
import { dalRead } from '../../../lib/dataAccessLayer';

export interface AdminSubscriptionRow {
  id: string;
  user_id: string;
  status: SubscriptionStatus;
  is_trial_used: boolean;
  trial_end_date: string | null;
  duration_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
  users: { name: string; role: string; is_active: boolean; email: string } | null;
}

export async function fetchAllSubscriptions(): Promise<AdminSubscriptionRow[]> {
  const result = await dalRead(
    `subscriptionsAdmin:allSubscriptions`,
    async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*, users:user_id(name, role, is_active, email)')
        .order('current_period_end', { ascending: true, nullsFirst: true });
      if (error) throw error;
      return (data || []) as unknown as AdminSubscriptionRow[];
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
