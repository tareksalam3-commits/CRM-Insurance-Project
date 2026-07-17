import { Inbox, RefreshCw } from 'lucide-react';
import { EmptyState as SharedEmptyState } from '../../../components/feedback/EmptyState';

interface EmptyStateProps {
  hasActiveFilters: boolean;
  onResetSearchAndFilters: () => void;
}

export function EmptyState({ hasActiveFilters, onResetSearchAndFilters }: EmptyStateProps) {
  return (
    <SharedEmptyState
      icon={Inbox}
      title="لا توجد أقساط مطابقة"
      description={hasActiveFilters ? 'جرّب تعديل كلمة البحث أو الفلاتر المُطبَّقة' : 'لا توجد أقساط ضمن هذا الفلتر حالياً'}
      action={
        hasActiveFilters && (
          <button onClick={onResetSearchAndFilters} className="btn btn-outline mt-4">
            <RefreshCw className="w-4 h-4" />
            <span>إعادة تعيين البحث والفلاتر</span>
          </button>
        )
      }
    />
  );
}
