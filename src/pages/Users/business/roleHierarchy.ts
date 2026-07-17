import { getRoleLevel } from '../../../lib/supabase';
import type { User, UserRole } from '../../../lib/supabase';

// الأدوار التي لا تحتاج مدير مباشر إطلاقاً
const NO_MANAGER_REQUIRED: UserRole[] = ['super_admin'];

// كل الأدوار بترتيب الهيكل الإداري
const ALL_ROLES: UserRole[] = [
  'super_admin', 'development_manager', 'general_supervisor',
  'supervisor', 'group_leader', 'agent', 'premium_agent',
];

// الأدوار التي يحق لدرجة وظيفية معيّنة إنشاؤها/تعديل الدرجة الوظيفية إليها
// (نفس المنطق المطبّق فى edge function admin-create-user)
export function getCreatableRoles(callerRole: UserRole): UserRole[] {
  if (callerRole === 'super_admin') return ALL_ROLES;
  const callerLevel = getRoleLevel(callerRole);
  return ALL_ROLES.filter((r) => getRoleLevel(r) > callerLevel);
}

export const getRoleBadgeClass = (role: UserRole) => {
  switch (getRoleLevel(role)) {
    case 1:  return 'bg-error-100 text-error-700 border-error-200';
    case 2:  return 'bg-warning-100 text-warning-700 border-warning-200';
    case 3:  return 'bg-info-100 text-info-700 border-info-200';
    case 4:  return 'bg-primary-100 text-primary-700 border-primary-200';
    case 5:  return 'bg-success-100 text-success-700 border-success-200';
    default: return 'bg-secondary-100 text-secondary-700 border-secondary-200';
  }
};

// ── manager dropdown filtering ─────────────────────────
// المدير المباشر ممكن يكون أي درجة وظيفية أعلى (مش لازم الدرجة اللي فوق
// مباشرة بالظبط). مثلاً: Agent ينفع يتحط تحت Group Leader أو Supervisor أو
// General Supervisor... إلخ، طالما درجته أعلى من درجة المستخدم الجديد.
export function getAllowedManagers(
  allUsers: User[],
  selectedRole: UserRole | undefined,
  editingUserId: string | undefined,
): User[] {
  if (!selectedRole || NO_MANAGER_REQUIRED.includes(selectedRole)) return [];
  const selectedLevel = getRoleLevel(selectedRole);
  return allUsers.filter((u) => {
    if (u.id === editingUserId) return false;
    return getRoleLevel(u.role) < selectedLevel;
  });
}
