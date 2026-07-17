import { memo } from 'react';
import type { InstallmentWithRelations } from '../types';
import { LoadingState } from './LoadingState';
import { EmptyState } from './EmptyState';
import { CollectionCard } from './CollectionCard';
import { Pagination } from '../../../components/ui/Pagination';

interface CollectionListProps {
  isInitialLoading: boolean;
  installments: InstallmentWithRelations[];
  hasActiveFilters: boolean;
  onResetSearchAndFilters: () => void;
  onPay: (installment: InstallmentWithRelations) => void;
  onCancel: (installment: InstallmentWithRelations) => void;
  onMore: (installment: InstallmentWithRelations) => void;
  page: number;
  totalPages: number;
  onPageChange: (updater: (p: number) => number) => void;
}

// ===== قائمة الأقساط (بطاقات) =====
// ملحوظة: الـ Skeleton يظهر فقط فى أول تحميل (لسه مفيش بيانات
// على الإطلاق). أما تحديثات الفلاتر/الصفحات اللاحقة فتحافظ على
// القائمة الحالية ظاهرة مع مؤشر تحديث بسيط بدل ما تختفي الشاشة
// بالكامل وتظهر Skeleton من جديد (وده كان سبب الرعشة عند كل
// تغيير فلتر أو صفحة).
function CollectionListImpl({
  isInitialLoading,
  installments,
  hasActiveFilters,
  onResetSearchAndFilters,
  onPay,
  onCancel,
  onMore,
  page,
  totalPages,
  onPageChange,
}: CollectionListProps) {
  if (isInitialLoading) {
    return <LoadingState />;
  }

  if (installments.length === 0) {
    return <EmptyState hasActiveFilters={hasActiveFilters} onResetSearchAndFilters={onResetSearchAndFilters} />;
  }

  return (
    <>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {installments.map((installment) => (
          <CollectionCard
            key={installment.id}
            installment={installment}
            onPay={onPay}
            onCancel={onCancel}
            onMore={onMore}
          />
        ))}
      </div>

      <Pagination page={page} totalPages={totalPages} onPageChange={onPageChange} />
    </>
  );
}

// React.memo: يمنع إعادة رسم شبكة بطاقات الأقساط بالكامل عند إعادة رسم
// الصفحة لأسباب لا علاقة لها بالقائمة نفسها
export const CollectionList = memo(CollectionListImpl);
