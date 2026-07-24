import { ROLE_LABELS, getRoleLevel, type UserRole } from '../../lib/supabase';

export const ROLE_STYLES: Record<UserRole, { bg: string; text: string; ring: string; dot: string }> = {
  super_admin:          { bg: 'bg-secondary-800',  text: 'text-white',        ring: 'ring-secondary-300', dot: 'bg-secondary-800' },
  development_manager:  { bg: 'bg-secondary-600',  text: 'text-white',        ring: 'ring-secondary-300', dot: 'bg-secondary-600' },
  general_supervisor:   { bg: 'bg-warning-100',    text: 'text-warning-700',  ring: 'ring-warning-200',   dot: 'bg-warning-500' },
  supervisor:           { bg: 'bg-primary-100',    text: 'text-primary-700',  ring: 'ring-primary-200',   dot: 'bg-primary-500' },
  group_leader:         { bg: 'bg-info-100',       text: 'text-info-700',     ring: 'ring-info-200',      dot: 'bg-info-500' },
  agent:                { bg: 'bg-success-100',    text: 'text-success-700',  ring: 'ring-success-200',   dot: 'bg-success-500' },
  premium_agent:        { bg: 'bg-success-100',    text: 'text-success-700',  ring: 'ring-success-200',   dot: 'bg-success-500' },
};

export const ROLE_FILTER_OPTIONS: { value: UserRole | 'all'; label: string }[] = [
  { value: 'all',                  label: 'كل الدرجات' },
  { value: 'development_manager',  label: ROLE_LABELS.development_manager },
  { value: 'general_supervisor',   label: ROLE_LABELS.general_supervisor },
  { value: 'supervisor',           label: ROLE_LABELS.supervisor },
  { value: 'group_leader',         label: ROLE_LABELS.group_leader },
  { value: 'agent',                label: ROLE_LABELS.agent },
  { value: 'premium_agent',        label: ROLE_LABELS.premium_agent },
];

// كل الدرجات مرتبة من الأعلى للأقل — تُستخدم فى مفتاح الألوان (Legend) فوق
// الشجرة عشان توضح معنى كل لون من أول نظرة قبل ما المستخدم يدخل فى التفاصيل
export const ROLE_ORDER: UserRole[] = [
  'super_admin', 'development_manager', 'general_supervisor',
  'supervisor', 'group_leader', 'agent', 'premium_agent',
];

// خيارات فلترة الدرجة الوظيفية المتاحة للمستخدم الحالي فقط (نظام هرمي) —
// إخفاء أي درجة أعلى منه، لأنها أصلاً مش موجودة فى نطاقه الإداري.
export function getVisibleRoleFilterOptions(currentUserRole: UserRole) {
  const myLevel = getRoleLevel(currentUserRole);
  return ROLE_FILTER_OPTIONS.filter(
    (opt) => opt.value === 'all' || getRoleLevel(opt.value) >= myLevel
  );
}
