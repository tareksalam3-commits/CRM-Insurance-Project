import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true
  }
});

export type User = {
  id: string;
  email: string;
  phone?: string;
  name: string;
  role: UserRole;
  manager_id?: string;
  target: number;
  is_active: boolean;
  avatar_url?: string;
  last_login?: string;
  created_at: string;
  updated_at: string;
};

export type UserRole =
  | 'super_admin'
  | 'development_manager'
  | 'general_supervisor'
  | 'supervisor'
  | 'group_leader'
  | 'agent'
  | 'premium_agent';

export type Customer = {
  id: string;
  name: string;
  national_id?: string;
  phone?: string;
  address?: string;
  birth_date?: string;
  occupation?: string;
  marital_status?: MaritalStatus;
  owner_id: string;
  created_at: string;
  updated_at: string;
};

export type MaritalStatus = 'single' | 'married' | 'divorced' | 'widowed';

export type Policy = {
  id: string;
  policy_number: string;
  customer_id: string;
  owner_id: string;
  policy_type: PolicyType;
  start_date: string;
  payment_method: PaymentMethod;
  premium_amount: number;
  status: PolicyStatus;
  notes?: string;
  suspended_at?: string;
  suspended_reason?: string;
  created_at: string;
  updated_at: string;
  customer?: Customer;
  owner?: User;
};

export type PolicyType =
  | 'quadruple'
  | 'protection_investment'
  | 'mixed'
  | 'installments'
  | 'pension_peace';

export type PaymentMethod = 'monthly' | 'quarterly' | 'semi_annual' | 'annual';

export type PolicyStatus = 'active' | 'suspended' | 'cancelled';

export type Installment = {
  id: string;
  policy_id: string;
  installment_number: number;
  amount: number;
  due_date: string;
  status: InstallmentStatus;
  paid_at?: string;
  is_first: boolean;
  created_at: string;
  updated_at: string;
  policy?: Policy;
};

export type InstallmentStatus = 'pending' | 'paid' | 'overdue';

export type Payment = {
  id: string;
  installment_id: string;
  amount: number;
  paid_at: string;
  paid_by_user_id: string;
  payment_month: string;
  is_cancelled: boolean;
  cancelled_at?: string;
  cancelled_by_user_id?: string;
  cancel_reason?: string;
  created_at: string;
};

export type Notification = {
  id: string;
  user_id: string;
  type: NotificationType;
  title: string;
  message: string;
  entity_type?: string;
  entity_id?: string;
  is_read: boolean;
  read_at?: string;
  created_at: string;
};

export type NotificationType =
  | 'due_today'
  | 'due_this_week'
  | 'overdue'
  | 'policy_suspended'
  | 'policy_reactivated'
  | 'payment_received'
  | 'payment_cancelled';

export type ActivityLog = {
  id: string;
  user_id: string;
  action_type: ActionType;
  entity_type: string;
  entity_id?: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  created_at: string;
};

export type ActionType =
  | 'login'
  | 'logout'
  | 'user_create'
  | 'user_update'
  | 'user_delete'
  | 'user_transfer'
  | 'user_disable'
  | 'user_enable'
  | 'customer_create'
  | 'customer_update'
  | 'customer_delete'
  | 'policy_create'
  | 'policy_update'
  | 'policy_suspend'
  | 'policy_reactivate'
  | 'policy_cancel'
  | 'payment_create'
  | 'payment_cancel'
  | 'month_close'
  | 'month_open'
  | 'settings_update'
  | 'role_update'
  | 'target_update';

export type MonthlyClosing = {
  id: string;
  month: string;
  closed_by_user_id: string;
  closed_at: string;
  is_open: boolean;
  opened_at?: string;
  opened_by_user_id?: string;
  notes?: string;
  created_at: string;
};

export type Settings = {
  id: string;
  company_name: string;
  company_logo_url?: string;
  insurance_year_start?: string;
  notification_days_before: number;
  overdue_months_to_suspend: number;
  created_at: string;
  updated_at: string;
};

export const ROLE_LABELS: Record<UserRole, string> = {
  super_admin: 'مدير النظام',
  development_manager: 'مدير التطوير',
  general_supervisor: 'المراقب العام',
  supervisor: 'المراقب',
  group_leader: 'رئيس المجموعة',
  agent: 'وكيل',
  premium_agent: 'وكيل مميز'
};

export const POLICY_TYPE_LABELS: Record<PolicyType, string> = {
  quadruple: 'الرباعية',
  protection_investment: 'حماية واستثمار',
  mixed: 'مختلط',
  installments: 'ذو أقساط',
  pension_peace: 'معاش واطمئنان'
};

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  monthly: 'شهري',
  quarterly: 'ربع سنوي',
  semi_annual: 'نصف سنوي',
  annual: 'سنوي'
};

export const POLICY_STATUS_LABELS: Record<PolicyStatus, string> = {
  active: 'نشط',
  suspended: 'موقوف',
  cancelled: 'ملغى'
};

export const INSTALLMENT_STATUS_LABELS: Record<InstallmentStatus, string> = {
  pending: 'غير مسدد',
  paid: 'مسدد',
  overdue: 'متأخر'
};

export const MARITAL_STATUS_LABELS: Record<MaritalStatus, string> = {
  single: 'أعزب/عزباء',
  married: 'متزوج/ة',
  divorced: 'مطلق/ة',
  widowed: 'أرمل/ة'
};

export function getRoleLevel(role: UserRole): number {
  const levels: Record<UserRole, number> = {
    super_admin: 1,
    development_manager: 2,
    general_supervisor: 3,
    supervisor: 4,
    group_leader: 5,
    agent: 6,
    premium_agent: 6
  };
  return levels[role];
}

export function canManageUsers(currentRole: UserRole): boolean {
  return currentRole === 'super_admin' || currentRole === 'development_manager';
}

export function canCloseMonth(role: UserRole): boolean {
  return getRoleLevel(role) <= 4;
}

export function canViewOrgStructure(role: UserRole): boolean {
  return getRoleLevel(role) <= 5;
}

export function canViewSettings(role: UserRole): boolean {
  return role === 'super_admin';
}
