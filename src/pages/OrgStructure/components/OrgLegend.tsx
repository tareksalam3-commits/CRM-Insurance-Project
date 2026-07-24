import clsx from 'clsx';
import { ROLE_LABELS, getRoleLevel, type UserRole } from '../../../lib/supabase';
import { ROLE_STYLES, ROLE_ORDER } from '../constants';
import type { RosterUser } from '../types';

// ─── مفتاح الألوان ────────────────────────────────────────
// شريط صغير فوق الشجرة يشرح معنى لون كل نقطة/بادچ — بيبان بس للدرجات
// الموجودة فعلاً فى نطاق المستخدم الحالي، بنفس ترتيب الهرم من فوق لتحت.
export function OrgLegend({
  roster,
  currentUserRole,
}: {
  roster: Map<string, RosterUser>;
  currentUserRole: UserRole;
}) {
  const myLevel = getRoleLevel(currentUserRole);
  const presentRoles = new Set(Array.from(roster.values()).map((u) => u.role));

  const roles = ROLE_ORDER.filter(
    (r) => presentRoles.has(r) && getRoleLevel(r) >= myLevel
  );

  if (roles.length === 0) return null;

  return (
    <div className="card !py-2.5 !px-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
      <span className="text-[10px] sm:text-xs font-semibold text-secondary-500 shrink-0">
        مفتاح الدرجات:
      </span>
      {roles.map((role) => (
        <span key={role} className="flex items-center gap-1 shrink-0">
          <span className={clsx('w-2 h-2 rounded-full', ROLE_STYLES[role].dot)} />
          <span className="text-[10px] sm:text-xs text-secondary-600">{ROLE_LABELS[role]}</span>
        </span>
      ))}
    </div>
  );
}
