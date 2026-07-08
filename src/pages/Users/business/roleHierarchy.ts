import { getRoleLevel } from '../../../lib/supabase';
import type { User, UserRole } from '../../../lib/supabase';

// كل درجة وظيفية لها درجة واحدة فقط مسموح يكون هو المدير المباشر
export const EXPECTED_PARENT: Partial<Record<UserRole, UserRole>> = {
  development_manager:  'super_admin',
  general_supervisor:   'development_manager',
  supervisor:           'general_supervisor',
  group_leader:         'supervisor',      // رئيس المجموعة لا بد تحت مراقب
  agent:                'group_leader',
  premium_agent:        'group_leader',
};

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
export function getAllowedManagers(
  allUsers: User[],
  selectedRole: UserRole | undefined,
  editingUserId: string | undefined,
): User[] {
  return allUsers.filter((u) => {
    if (!selectedRole) return true;
    if (u.id === editingUserId) return false;
    const expected = EXPECTED_PARENT[selectedRole];
    if (!expected) return false; // super_admin مثلاً ما يحتاج مدير
    return u.role === expected;
  });
}
