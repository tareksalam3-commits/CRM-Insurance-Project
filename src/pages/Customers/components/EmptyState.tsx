import { Inbox, RefreshCw, Plus } from 'lucide-react';
import { EmptyState as SharedEmptyState } from '../../../components/feedback/EmptyState';

interface EmptyStateProps {
  hasActiveFilters: boolean;
  onResetAll: () => void;
  onAddCustomer: () => void;
}

export function EmptyState({ hasActiveFilters, onResetAll, onAddCustomer }: EmptyStateProps) {
  if (hasActiveFilters) {
    return (
      <SharedEmptyState
        icon={Inbox}
        title="لا توجد نتائج مطابقة"
        description="جرّب تعديل كلمة البحث أو الفلاتر المُطبَّقة"
        action={
          <button onClick={onResetAll} className="btn btn-outline mt-4">
            <RefreshCw className="w-4 h-4" />
            <span>إعادة تعيين البحث والفلاتر</span>
          </button>
        }
      />
    );
  }

  return (
    <SharedEmptyState
      icon={Inbox}
      title="لا يوجد عملاء حتى الآن"
      description="ابدأ بإضافة أول عميل"
      action={
        <button onClick={onAddCustomer} className="btn btn-outline mt-4">
          <Plus className="w-4 h-4" />
          <span>إضافة عميل جديد</span>
        </button>
      }
    />
  );
}
