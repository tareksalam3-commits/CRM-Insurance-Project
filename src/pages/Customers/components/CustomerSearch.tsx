import type { ReactNode } from 'react';
import { ClipboardList } from 'lucide-react';
import clsx from 'clsx';
import { SearchInput } from '../../../components/forms/SearchInput';
import { FilterButton } from '../../../components/forms/FilterButton';

interface CustomerSearchProps {
  localSearch: string;
  onLocalSearchChange: (value: string) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  activeFilterCount: number;
  isInitialLoading: boolean;
  loading: boolean;
  totalCount: number;
  // زر ثابت "طلبات الإصدار" — فلتر عملاء بدون وثائق، موجود دايماً تحت زر
  // الفلاتر (مش جزء من لوحة الفلاتر القابلة للطي)
  noPolicyOnly: boolean;
  onToggleNoPolicyOnly: () => void;
  // لوحة الفلاتر القابلة للطي — بتتعرض هنا بالظبط بين صف البحث وسطر عدد
  // النتائج، بنفس ترتيب الـ DOM الأصلي فى index.tsx
  filtersPanel?: ReactNode;
}

export function CustomerSearch({
  localSearch,
  onLocalSearchChange,
  showFilters,
  onToggleFilters,
  activeFilterCount,
  isInitialLoading,
  loading,
  totalCount,
  noPolicyOnly,
  onToggleNoPolicyOnly,
  filtersPanel,
}: CustomerSearchProps) {
  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput
          value={localSearch}
          onChange={onLocalSearchChange}
          placeholder="ابحث بالاسم، الهاتف، الرقم القومي، رقم الوثيقة أو اسم الوكيل..."
        />
        <FilterButton active={showFilters} count={activeFilterCount} onClick={onToggleFilters} />
      </div>

      <button
        onClick={onToggleNoPolicyOnly}
        className={clsx(
          'btn btn-warning w-full sm:w-auto shrink-0',
          noPolicyOnly && 'ring-2 ring-offset-1 ring-warning-700'
        )}
      >
        <ClipboardList className="w-4 h-4" />
        <span>طلبات فى الاصدار</span>
      </button>

      {filtersPanel}

      {!isInitialLoading && (
        <p className="text-xs text-secondary-500 flex items-center gap-2">
          <span>عدد النتائج: <span className="font-semibold text-secondary-700">{totalCount}</span></span>
          {loading && (
            <span className="inline-flex items-center gap-1 text-secondary-400">
              <span className="w-3 h-3 rounded-full border-2 border-secondary-300 border-t-primary-500 animate-spin" />
              <span>جارِ التحديث...</span>
            </span>
          )}
        </p>
      )}
    </>
  );
}
