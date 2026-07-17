// أنواع نظام الاشتراكات — مفصولة تماماً عن باقي أنواع المشروع
import type { UserRole } from '../../lib/supabase';

export type SubscriptionStatus = 'trial' | 'active' | 'expired' | 'pending_payment' | 'suspended';
export type SubscriptionPaymentMethodKey = 'instapay' | 'vodafone_cash';
export type SubscriptionPaymentRequestStatus =
  | 'submitted' | 'ocr_verified' | 'ocr_mismatch' | 'approved' | 'rejected';

export interface SubscriptionDuration {
  id: string;
  key: string;
  label: string;
  months: number;
  is_active: boolean;
  is_default: boolean;
  sort_order: number;
}

export interface SubscriptionPlanPrice {
  id: string;
  role: UserRole;
  duration_id: string;
  price: number;
  is_active: boolean;
}

export interface SubscriptionSettings {
  id: string;
  subscriptions_enabled: boolean;
  trial_enabled: boolean;
  trial_months: number;
  grace_period_days: number;
  default_duration_id: string | null;
  instapay_enabled: boolean;
  instapay_name: string | null;
  instapay_number: string | null;
  vodafone_cash_enabled: boolean;
  vodafone_cash_name: string | null;
  vodafone_cash_number: string | null;
  qr_code_url: string | null;
}

export interface MySubscription {
  id: string;
  user_id: string;
  status: SubscriptionStatus;
  is_trial_used: boolean;
  trial_start_date: string | null;
  trial_end_date: string | null;
  duration_id: string | null;
  current_period_start: string | null;
  current_period_end: string | null;
}

export interface PayableSubordinate {
  user_id: string;
  name: string;
  role: UserRole;
  manager_id: string | null;
  is_active: boolean;
  subscription_status: SubscriptionStatus;
  current_period_end: string | null;
  is_trial_used: boolean;
}

export interface SubscriptionPaymentRequest {
  id: string;
  payer_user_id: string;
  included_user_ids: string[];
  duration_id: string;
  payment_method: SubscriptionPaymentMethodKey;
  amount_original: number;
  amount_final: number;
  receipt_url: string;
  reference_number: string | null;
  status: SubscriptionPaymentRequestStatus;
  rejection_reason: string | null;
  created_at: string;
}
