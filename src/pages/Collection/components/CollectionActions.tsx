import { CheckCircle, XCircle, MoreVertical } from 'lucide-react';
import type { InstallmentWithRelations } from '../types';

interface CollectionActionsProps {
  installment: InstallmentWithRelations;
  isPaid: boolean;
  onPay: (installment: InstallmentWithRelations) => void;
  onCancel: (installment: InstallmentWithRelations) => void;
  onMore: (installment: InstallmentWithRelations) => void;
}

export function CollectionActions({ installment, isPaid, onPay, onCancel, onMore }: CollectionActionsProps) {
  return (
    <div className="flex items-center gap-2 mt-4 pt-3 border-t border-secondary-100">
      {isPaid ? (
        <button onClick={() => onCancel(installment)} className="btn btn-secondary btn-sm flex-1">
          <XCircle className="w-4 h-4" />
          <span>إلغاء السداد</span>
        </button>
      ) : (
        <button onClick={() => onPay(installment)} className="btn btn-primary btn-sm flex-1">
          <CheckCircle className="w-4 h-4" />
          <span>تسجيل السداد</span>
        </button>
      )}
      <button
        onClick={() => onMore(installment)}
        className="btn btn-secondary btn-sm touch-target"
        title="المزيد"
      >
        <MoreVertical className="w-4 h-4" />
      </button>
    </div>
  );
}
