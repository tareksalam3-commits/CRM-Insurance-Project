import { Inbox, RefreshCw, Plus } from 'lucide-react';
import { EmptyState as SharedEmptyState } from '../../../components/feedback/EmptyState';

interface EmptyStateProps {
  hasActiveFilters: boolean;
  onResetAll: () => void;
  onAddPolicy: () => void;
}

export function EmptyState({ hasActiveFilters, onResetAll, onAddPolicy }: EmptyStateProps) {
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
      title="لا توجد وثائق حتى الآن"
      description="ابدأ بإصدار أول وثيقة تأمين"
      action={
        <button onClick={onAddPolicy} className="btn btn-outline mt-4">
          <Plus className="w-4 h-4" />
          <span>إصدار وثيقة جديدة</span>
        </button>
      }
    />
  );
}
