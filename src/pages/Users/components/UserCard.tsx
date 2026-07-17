import { memo } from 'react';
import { Eye, Edit2, Lock, UserCheck, UserX, Trash2, Phone, Mail } from 'lucide-react';
import type { ReactNode } from 'react';
import clsx from 'clsx';
import { ROLE_LABELS, type User } from '../../../lib/supabase';
import { getRoleBadgeClass } from '../business/roleHierarchy';
import { UserAvatar } from './UserAvatar';

interface UserCardProps {
  user: User;
  togglingId: string | null;
  onViewDetails: (u: User) => void;
  onEdit: (u: User) => void;
  onChangePassword: (u: User) => void;
  canResetPassword: boolean;
  onToggleActive: (u: User) => void;
  onDelete: (u: User) => void;
}

// زرار إجراء صغير وموحّد الشكل لكل الأزرار أسفل البطاقة
function ActionButton({
  label,
  onClick,
  className,
  disabled,
  children,
}: {
  label: string;
  onClick: () => void;
  className?: string;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={clsx(
        'flex-1 flex items-center justify-center py-2.5 rounded-lg',
        'transition-colors duration-200 disabled:opacity-50 disabled:cursor-not-allowed',
        'pressable touch-target',
        className
      )}
    >
      {children}
    </button>
  );
}

function UserCardImpl({
  user: u,
  togglingId,
  onViewDetails,
  onEdit,
  onChangePassword,
  canResetPassword,
  onToggleActive,
  onDelete,
}: UserCardProps) {
  const isToggling = togglingId === u.id;

  return (
    <div className="card p-0 overflow-hidden flex flex-col hover:shadow-md transition-shadow duration-200 animate-fadeIn">
      {/* Body */}
      <button
        type="button"
        onClick={() => onViewDetails(u)}
        className="flex items-start gap-3 p-4 text-right w-full hover:bg-secondary-50/60 transition-colors duration-150"
      >
        <UserAvatar user={u} size="md" />

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-semibold text-secondary-900 truncate leading-tight">
              {u.name}
            </h3>
            <span
              className={clsx(
                'badge shrink-0',
                u.is_active ? 'badge-success' : 'badge-error'
              )}
            >
              {u.is_active ? 'نشط' : 'غير نشط'}
            </span>
          </div>

          <span className={clsx('badge border mt-1.5 inline-flex', getRoleBadgeClass(u.role))}>
            {ROLE_LABELS[u.role]}
          </span>

          <div className="mt-2.5 space-y-1.5">
            <div className="flex items-center gap-1.5 text-sm text-secondary-500">
              <Phone className="w-3.5 h-3.5 shrink-0" />
              <span dir="ltr" className="truncate">{u.phone || '—'}</span>
            </div>
            <div className="flex items-center gap-1.5 text-sm text-secondary-500">
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span dir="ltr" className="truncate">{u.email}</span>
            </div>
          </div>
        </div>
      </button>

      {/* Actions */}
      <div className="flex items-center gap-1 px-2 pb-2 pt-1 border-t border-secondary-100 mt-auto">
        <ActionButton
          label="عرض التفاصيل"
          onClick={() => onViewDetails(u)}
          className="text-secondary-500 hover:bg-secondary-100 hover:text-secondary-900"
        >
          <Eye className="w-4 h-4" />
        </ActionButton>

        <ActionButton
          label="تعديل البيانات"
          onClick={() => onEdit(u)}
          className="text-primary-600 hover:bg-primary-50"
        >
          <Edit2 className="w-4 h-4" />
        </ActionButton>

        {canResetPassword && (
          <ActionButton
            label="تغيير كلمة المرور"
            onClick={() => onChangePassword(u)}
            className="text-warning-600 hover:bg-warning-50"
          >
            <Lock className="w-4 h-4" />
          </ActionButton>
        )}

        <ActionButton
          label={u.is_active ? 'تعطيل الحساب' : 'إعادة تنشيط الحساب'}
          onClick={() => onToggleActive(u)}
          disabled={isToggling}
          className={
            u.is_active
              ? 'text-error-600 hover:bg-error-50'
              : 'text-success-600 hover:bg-success-50'
          }
        >
          {isToggling ? (
            <div className="w-4 h-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
          ) : u.is_active ? (
            <UserX className="w-4 h-4" />
          ) : (
            <UserCheck className="w-4 h-4" />
          )}
        </ActionButton>

        <ActionButton
          label="حذف المستخدم"
          onClick={() => onDelete(u)}
          className="text-error-600 hover:bg-error-50"
        >
          <Trash2 className="w-4 h-4" />
        </ActionButton>
      </div>
    </div>
  );
}

// React.memo: يمنع إعادة رسم كل بطاقات المستخدمين عند إعادة رسم الصفحة
// لأسباب لا علاقة لها بالبطاقة نفسها
export const UserCard = memo(UserCardImpl);
