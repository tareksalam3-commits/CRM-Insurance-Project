import type { ReactNode } from 'react';
import { SearchInput } from '../../../components/forms/SearchInput';
import { FilterButton } from '../../../components/forms/FilterButton';

interface PoliciesSearchProps {
  localSearch: string;
  onLocalSearchChange: (value: string) => void;
  showFilters: boolean;
  onToggleFilters: () => void;
  activeFilterCount: number;
  isInitialLoading: boolean;
  loading: boolean;
  totalCount: number;
  // لوحة الفلاتر القابلة للطي — بتتعرض هنا بالظبط بين صف البحث وسطر عدد
  // النتائج، بنفس ترتيب الـ DOM الأصلي فى index.tsx
  filtersPanel?: ReactNode;
}

export function PoliciesSearch({
  localSearch,
  onLocalSearchChange,
  showFilters,
  onToggleFilters,
  activeFilterCount,
  isInitialLoading,
  loading,
  totalCount,
  filtersPanel,
}: PoliciesSearchProps) {
  return (
    <>
      <div className="flex flex-col sm:flex-row gap-3">
        <SearchInput
          value={localSearch}
          onChange={onLocalSearchChange}
          placeholder="ابحث باسم العميل، رقم الوثيقة، الرقم القومي أو الهاتف..."
        />
        <FilterButton active={showFilters} count={activeFilterCount} onClick={onToggleFilters} />
      </div>

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
