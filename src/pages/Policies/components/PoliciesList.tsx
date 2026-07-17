import { memo } from 'react';
import type { Policy } from '../../../lib/supabase';
import { Pagination } from '../../../components/ui/Pagination';
import { LoadingState } from './LoadingState';
import { EmptyState } from './EmptyState';
import { PolicyCard } from './PolicyCard';

interface PoliciesListProps {
  isInitialLoading: boolean;
  policies: Policy[];
  hasActiveFilters: boolean;
  onResetAll: () => void;
  onAddPolicy: () => void;
  onOpenDetails: (policy: Policy) => void;
  onOpenMoreMenu: (policy: Policy) => void;
  page: number;
  setPage: (updater: (p: number) => number) => void;
  totalPages: number;
}

function PoliciesListImpl({
  isInitialLoading,
  policies,
  hasActiveFilters,
  onResetAll,
  onAddPolicy,
  onOpenDetails,
  onOpenMoreMenu,
  page,
  setPage,
  totalPages,
}: PoliciesListProps) {
  if (isInitialLoading) {
    return <LoadingState />;
  }

  if (policies.length === 0) {
    return (
      <EmptyState
        hasActiveFilters={hasActiveFilters}
        onResetAll={onResetAll}
        onAddPolicy={onAddPolicy}
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {policies.map((policy) => (
          <PolicyCard
            key={policy.id}
            policy={policy}
            onOpenDetails={onOpenDetails}
            onOpenMoreMenu={onOpenMoreMenu}
          />
        ))}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </>
  );
}

// React.memo: يمنع إعادة رسم كل بطاقات الوثائق عند إعادة رسم الصفحة لأسباب
// لا علاقة لها بالقائمة (فتح مودال، تغيير حالة أخرى..)
export const PoliciesList = memo(PoliciesListImpl);
