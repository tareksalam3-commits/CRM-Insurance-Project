// طبقة الوصول للبيانات الخاصة بنظام الاشتراكات — مفصولة عن باقي خدمات المشروع
import { supabase } from '../../../lib/supabase';
import type {
  SubscriptionDuration, SubscriptionPlanPrice, SubscriptionSettings,
  MySubscription, PayableSubordinate, SubscriptionPaymentMethodKey
} from '../types';
import { dalRead } from '../../../lib/dataAccessLayer';

export async function fetchSubscriptionSettings(): Promise<SubscriptionSettings | null> {
  const result = await dalRead(
    `subscriptions:settings`,
    async () => {
      const { data, error } = await supabase.from('subscription_settings').select('*').maybeSingle();
      if (error) throw error;
      return data as SubscriptionSettings | null;
    },
    { emptyValue: null as SubscriptionSettings | null },
  );
  return result.data;
}

export async function fetchDurations(): Promise<SubscriptionDuration[]> {
  const result = await dalRead(
    `subscriptions:durations`,
    async () => {
      const { data, error } = await supabase
        .from('subscription_durations')
        .select('*')
        .eq('is_active', true)
        .order('sort_order');
      if (error) throw error;
      return (data || []) as SubscriptionDuration[];
    },
    { emptyValue: [] as SubscriptionDuration[] },
  );
  return result.data;
}

export async function fetchPrices(): Promise<SubscriptionPlanPrice[]> {
  const result = await dalRead(
    `subscriptions:prices`,
    async () => {
      const { data, error } = await supabase.from('subscription_plan_prices').select('*').eq('is_active', true);
      if (error) throw error;
      return (data || []) as SubscriptionPlanPrice[];
    },
    { emptyValue: [] as SubscriptionPlanPrice[] },
  );
  return result.data;
}

export async function fetchMySubscription(userId: string): Promise<MySubscription | null> {
  const result = await dalRead(
    `subscriptions:mine:${userId}`,
    async () => {
      const { data, error } = await supabase
        .from('subscriptions')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      if (error) throw error;
      return data as MySubscription | null;
    },
    { emptyValue: null as MySubscription | null },
  );
  return result.data;
}

export async function fetchPayableSubordinates(userId: string): Promise<PayableSubordinate[]> {
  const result = await dalRead(
    `subscriptions:payableSubordinates:${userId}`,
    async () => {
      const { data, error } = await supabase.rpc('get_payable_subordinates', { p_payer_id: userId });
      if (error) throw error;
      return (data || []) as PayableSubordinate[];
    },
    { emptyValue: [] as PayableSubordinate[] },
  );
  return result.data;
}

// آخر طلب دفع للمستخدم (لعرض حالة "قيد المراجعة" أو "مرفوض" لو موجود)
export async function fetchLatestPaymentRequest(userId: string) {
  const result = await dalRead(
    `subscriptions:latestPaymentRequest:${userId}`,
    async () => {
      const { data, error } = await supabase
        .from('subscription_payments')
        .select('*')
        .eq('payer_user_id', userId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    { emptyValue: null as any },
  );
  return result.data;
}

// رفع صورة الإيصال إلى الـ bucket الخاص (غير عام)، وإرجاع المسار الداخلي
// (المسار وليس رابط عام، لأن الـ bucket خاص ومحمي بصلاحيات)
export async function uploadReceipt(userId: string, file: File): Promise<string> {
  const ext = file.name.split('.').pop() || 'jpg';
  const path = `${userId}/${Date.now()}.${ext}`;

  const { error } = await supabase.storage.from('subscription-receipts').upload(path, file, {
    cacheControl: '3600',
    upsert: false
  });
  if (error) throw error;
  return path;
}

export async function getReceiptSignedUrl(path: string): Promise<string | null> {
  const { data, error } = await supabase.storage
    .from('subscription-receipts')
    .createSignedUrl(path, 60 * 10); // صالح لـ 10 دقائق
  if (error) {
    console.error('Error creating signed url:', error);
    return null;
  }
  return data?.signedUrl || null;
}

export interface SubscriptionLockState {
  is_locked: boolean;
  status: string;
  period_end: string | null;
  grace_period_days: number;
}

export async function fetchLockState(): Promise<SubscriptionLockState | null> {
  const result = await dalRead(
    `subscriptions:lockState`,
    async () => {
      const { data, error } = await supabase.rpc('get_my_subscription_lock_state');
      if (error) throw error;
      // RPC ترجع صف واحد كمصفوفة
      return Array.isArray(data) ? data[0] || null : data;
    },
    { emptyValue: null as SubscriptionLockState | null },
  );
  return result.data;
}

export interface SubmitPaymentInput {
  payerUserId: string;
  includedUserIds: string[]; // بخلاف الدافع نفسه، مش شامل الوكلاء (بيتفعّلوا تلقائياً)
  durationId: string;
  paymentMethod: SubscriptionPaymentMethodKey;
  amountOriginal: number;
  amountFinal: number;
  receiptPath: string;
  referenceNumber: string;
}

export async function submitPaymentRequest(input: SubmitPaymentInput) {
  const { data, error } = await supabase
    .from('subscription_payments')
    .insert({
      payer_user_id: input.payerUserId,
      included_user_ids: input.includedUserIds,
      duration_id: input.durationId,
      payment_method: input.paymentMethod,
      amount_original: input.amountOriginal,
      amount_final: input.amountFinal,
      receipt_url: input.receiptPath,
      reference_number: input.referenceNumber || null,
      status: 'submitted'
    })
    .select()
    .single();

  if (error) {
    // رقم مرجعي مستخدم من قبل (unique index على وسيلة الدفع + الرقم المرجعي)
    if (error.code === '23505') {
      throw new Error('الرقم المرجعي ده مستخدم بالفعل في طلب سابق');
    }
    throw error;
  }

  await supabase.rpc('log_subscription_action', {
    p_action: 'payment_request_submitted',
    p_target_user_id: input.payerUserId,
    p_payment_id: data.id,
    p_notes: null
  });

  return data;
}
