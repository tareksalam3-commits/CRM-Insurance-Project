import { useState } from 'react';
import clsx from 'clsx';
import type { User, UserRole } from '../../../lib/supabase';
import { getRoleLevel } from '../../../lib/supabase';

// ألوان الأفاتار الافتراضي (بدون صورة) حسب المستوى الوظيفي — نفس منطق الألوان
// المستخدم بالفعل في شارات الدرجة الوظيفية، بس بدرجة أغمق تناسب الخلفية الملوّنة
const AVATAR_GRADIENTS: Record<number, string> = {
  1: 'from-error-500 to-error-600',
  2: 'from-warning-500 to-warning-600',
  3: 'from-info-500 to-info-600',
  4: 'from-primary-500 to-primary-600',
  5: 'from-success-500 to-success-600',
  6: 'from-secondary-500 to-secondary-600',
};

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '؟';
  if (parts.length === 1) return parts[0].slice(0, 2);
  return `${parts[0][0]}${parts[1][0]}`;
}

interface UserAvatarProps {
  user: Pick<User, 'name' | 'role' | 'avatar_url'>;
  size?: 'sm' | 'md' | 'lg';
}

const SIZE_CLASSES: Record<NonNullable<UserAvatarProps['size']>, string> = {
  sm: 'w-9 h-9 text-xs',
  md: 'w-14 h-14 text-lg',
  lg: 'w-20 h-20 text-2xl',
};

export function UserAvatar({ user, size = 'md' }: UserAvatarProps) {
  const [imgError, setImgError] = useState(false);
  const level = getRoleLevel(user.role as UserRole) || 6;
  const gradient = AVATAR_GRADIENTS[level] || AVATAR_GRADIENTS[6];

  if (user.avatar_url && !imgError) {
    return (
      <img
        src={user.avatar_url}
        alt={user.name}
        onError={() => setImgError(true)}
        className={clsx(
          SIZE_CLASSES[size],
          'rounded-full object-cover shrink-0 ring-2 ring-white shadow-sm'
        )}
      />
    );
  }

  return (
    <div
      className={clsx(
        SIZE_CLASSES[size],
        'rounded-full shrink-0 flex items-center justify-center font-bold text-white',
        'bg-gradient-to-br shadow-sm ring-2 ring-white',
        gradient
      )}
    >
      {getInitials(user.name)}
    </div>
  );
}
