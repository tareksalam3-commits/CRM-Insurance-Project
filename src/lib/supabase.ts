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

// فحص إن جهاز/متصفح المستخدم بيدعم أصلاً تسجيل الدخول بالبصمة (WebAuthn)
export function isPasskeySupported(): boolean {
  return typeof window !== 'undefined' && !!window.PublicKeyCredential;
}

// رابط الـ Edge Functions الخاصة بتسجيل الدخول بالبصمة (WebAuthn)
export const WEBAUTHN_FUNCTIONS_URL = `${supabaseUrl}/functions/v1`;

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
  deleted_at?: string | null;
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
  // بيانات "طلب التأمين" الأولية عند تسجيل العميل — تُستخدم لاحقاً لتعبئة
  // مبلغ التأمين وطريقة السداد تلقائياً عند إصدار وثيقة له (راجع
  // pages/Policies/hooks/usePolicyActions.ts)، والعربون لعرضه فقط مع بيانات العميل
  insurance_amount?: number;
  payment_method?: PaymentMethod;
  deposit_amount?: number;
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
  sum_assured?: number;
  status: PolicyStatus;
  notes?: string;
  suspended_at?: string;
  suspended_reason?: string;
  cancelled_at?: string;
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

// حالة "موقوف" اتشالت من النظام بالكامل (الوثيقة بقت إما نشطة أو ملغاة فقط).
// لو فيه سجلات قديمة فى قاعدة البيانات لسه بالحالة دي (نادر، بيتم تحويلها
// تلقائياً لـ "نشطة" فى الهجرة 20260713000000)، فبيتعامل معاها العرض بنفس
// شكل "نشط" افتراضياً لأن مفيش أي مسار جديد هيُنتج الحالة دي تانى.
export type PolicyStatus = 'active' | 'cancelled';

export type Installment = {
  id: string;
  policy_id: string;
  installment_number: number;
  amount: number;
  due_date: string;
  status: InstallmentStatus;
  paid_at?: string;
  is_first: boolean;
  // true للأقساط المستوردة/القديمة التي اعتُبرت مسددة تلقائياً عند
  // الاستيراد أو الإضافة، دون إنشاء سجل سداد (payments) فعلي — راجع
  // معالجة إلغاء السداد الخاصة بها في
  // features/installments/installmentsService.cancelInstallmentPayment
  is_historical?: boolean;
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
  | 'payment_cancelled'
  | 'subscription_approved'
  | 'subscription_rejected'
  | 'subscription_expiring_soon'
  | 'subscription_expired'
  | 'user_created'
  | 'user_updated'
  | 'user_disabled'
  | 'user_enabled'
  | 'user_deleted'
  | 'customer_created'
  | 'policy_created'
  | 'policy_cancelled'
  | 'month_closing_upcoming'
  | 'month_closing_completed';

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
  | 'target_update'
  | 'year2_payment_create'
  | 'year2_payment_cancel';

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
  premium_agent: 'وسيط حر'
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

// صفحة المستخدمين متاحة الآن لكل درجة إدارية (Group Leader فما فوق) بنظام
// هرمي: كل مدير يرى ويدير فقط من هم داخل نطاقه الإداري (get_user_subtree).
// Agent / Premium Agent (المستوى 6) لا تظهر لهم الصفحة إطلاقاً.
export function canManageUsers(currentRole: UserRole): boolean {
  return getRoleLevel(currentRole) <= 5;
}

// إعادة تعيين كلمة مرور مستخدم آخر: Super Admin فقط.
export function canResetOtherUserPassword(currentRole: UserRole): boolean {
  return currentRole === 'super_admin';
}

// عرض صفحة تقفيل الشهر متاح لأي درجة إدارية (Group Leader فما فوق) بنظام
// هرمي — كل واحد يشوف بس بيانات نطاقه الإداري. أما تنفيذ تقفيل/فتح الشهر
// نفسه (عملية تخص النظام كله دفعة واحدة) فتفضل مقصورة على Supervisor فما فوق
// (canCloseMonth تحتها).
export function canViewMonthlyClosing(role: UserRole): boolean {
  return getRoleLevel(role) <= 5;
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

// إدارة الفروع (إضافة/تعطيل فرع، وربط مستخدم بوضع وظيفي إضافي فى فرع تاني):
// Super Admin بس — نفس منطق تعديل جداول branches / user_branch_roles على
// مستوى RLS (راجع migration 056_branches_admin_super_admin_only).
export function canManageBranches(role: UserRole): boolean {
  return role === 'super_admin';
}

// إدخال إحصائيات العمل اليومية المجمّعة لكل فرد فى الفريق: رئيس المجموعة
// فقط (راجع صفحة DailyReports ونظام daily_agent_stats — رئيس المجموعة يدخل
// الأرقام بعد استلام التقرير الورقي من الإيجنت، ولا يوجد إدخال من الإيجنت
// نفسه ولا "حالة اعتماد" منفصلة).
export function canEnterDailyAgentStats(role: UserRole): boolean {
  return role === 'group_leader';
}

