import { memo } from 'react';
import type { User } from '../../../lib/supabase';
import { Pagination } from '../../../components/ui/Pagination';
import { UserCard } from './UserCard';
import { UserCardSkeleton } from './UserCardSkeleton';
import { UsersEmptyState } from './UsersEmptyState';

interface UsersGridProps {
  users: User[];
  // true فقط عند أول تحميل (لسه مفيش أي بيانات) — يظهر معاها الـ Skeleton
  // الكامل. أي تحديث لاحق (فلتر/صفحة/بحث) وفيه بيانات سابقة بيفضل معروض
  // مع مؤشر تحديث بسيط بدل ما يختفي كله ويظهر Skeleton من جديد.
  isInitialLoading: boolean;
  page: number;
  totalPages: number;
  setPage: (updater: (p: number) => number) => void;
  togglingId: string | null;
  hasFilters: boolean;
  onClearFilters: () => void;
  onAddUser: () => void;
  onViewDetails: (u: User) => void;
  onEdit: (u: User) => void;
  onChangePassword: (u: User) => void;
  canResetPassword: boolean;
  onToggleActive: (u: User) => void;
  onDelete: (u: User) => void;
}

function UsersGridImpl({
  users, isInitialLoading, page, totalPages, setPage,
  togglingId, hasFilters, onClearFilters, onAddUser,
  onViewDetails, onEdit, onChangePassword, canResetPassword, onToggleActive, onDelete,
}: UsersGridProps) {
  if (isInitialLoading) {
    return (
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <UserCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <UsersEmptyState
        hasFilters={hasFilters}
        onClearFilters={onClearFilters}
        onAddUser={onAddUser}
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4">
        {users.map((u) => (
          <UserCard
            key={u.id}
            user={u}
            togglingId={togglingId}
            onViewDetails={onViewDetails}
            onEdit={onEdit}
            onChangePassword={onChangePassword}
            canResetPassword={canResetPassword}
            onToggleActive={onToggleActive}
            onDelete={onDelete}
          />
        ))}
      </div>

      {/* Pagination */}
      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </>
  );
}

// React.memo: يمنع إعادة رسم كل بطاقات المستخدمين عند إعادة رسم الصفحة
// لأسباب لا علاقة لها بالقائمة نفسها
export const UsersGrid = memo(UsersGridImpl);
