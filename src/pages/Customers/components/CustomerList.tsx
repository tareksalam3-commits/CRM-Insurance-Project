import { memo } from 'react';
import type { CustomerWithRelations } from '../types';
import { Pagination } from '../../../components/ui/Pagination';
import { LoadingState } from './LoadingState';
import { EmptyState } from './EmptyState';
import { CustomerCard } from './CustomerCard';

interface CustomerListProps {
  isInitialLoading: boolean;
  customers: CustomerWithRelations[];
  hasActiveFilters: boolean;
  onResetAll: () => void;
  onAddCustomer: () => void;
  onOpenDetails: (customer: CustomerWithRelations) => void;
  onOpenMoreMenu: (customer: CustomerWithRelations) => void;
  page: number;
  setPage: (updater: (p: number) => number) => void;
  totalPages: number;
}

function CustomerListImpl({
  isInitialLoading,
  customers,
  hasActiveFilters,
  onResetAll,
  onAddCustomer,
  onOpenDetails,
  onOpenMoreMenu,
  page,
  setPage,
  totalPages,
}: CustomerListProps) {
  if (isInitialLoading) {
    return <LoadingState />;
  }

  if (customers.length === 0) {
    return (
      <EmptyState
        hasActiveFilters={hasActiveFilters}
        onResetAll={onResetAll}
        onAddCustomer={onAddCustomer}
      />
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {customers.map((customer) => (
          <CustomerCard
            key={customer.id}
            customer={customer}
            onOpenDetails={onOpenDetails}
            onOpenMoreMenu={onOpenMoreMenu}
          />
        ))}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={setPage} />
    </>
  );
}

// React.memo: تمنع إعادة رسم شبكة البطاقات بالكامل عند إعادة رسم صفحة
// العملاء لأسباب لا علاقة لها بالقائمة نفسها (مودالات، حالة البحث..).
export const CustomerList = memo(CustomerListImpl);
