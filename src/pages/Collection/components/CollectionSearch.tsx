import { SearchInput } from '../../../components/forms/SearchInput';
import { FilterButton } from '../../../components/forms/FilterButton';

interface CollectionSearchProps {
  localSearch: string;
  onLocalSearchChange: (value: string) => void;
  showFilters: boolean;
  activeFilterCount: number;
  onOpenFilters: () => void;
}

export function CollectionSearch({
  localSearch,
  onLocalSearchChange,
  showFilters,
  activeFilterCount,
  onOpenFilters,
}: CollectionSearchProps) {
  return (
    <div className="flex flex-col sm:flex-row gap-3">
      <SearchInput
        value={localSearch}
        onChange={onLocalSearchChange}
        placeholder="ابحث بالاسم، رقم الوثيقة، الهاتف، الرقم القومي أو اسم الوكيل..."
      />
      <FilterButton active={showFilters} count={activeFilterCount} onClick={onOpenFilters} />
    </div>
  );
}
