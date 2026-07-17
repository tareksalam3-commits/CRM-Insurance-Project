import { Edit2, DollarSign, ListChecks, Printer, RotateCcw, XCircle, Trash2, History } from 'lucide-react';
import { AppBottomSheet } from '../../../../components/ui/AppBottomSheet';
import type { Policy } from '../../../../lib/supabase';

interface MoreActionsDialogProps {
  policy: Policy;
  canDelete: boolean;
  onClose: () => void;
  onEdit: (policy: Policy) => void;
  onGoToPolicy: (policy: Policy) => void;
  onPrint: (policy: Policy) => void;
  onReactivate: (policy: Policy) => void;
  onCancelPolicy: (policy: Policy) => void;
  onDeleteRequest: (policy: Policy) => void;
  onOpenActivityLog: () => void;
}

export function MoreActionsDialog({
  policy,
  canDelete,
  onClose,
  onEdit,
  onGoToPolicy,
  onPrint,
  onReactivate,
  onCancelPolicy,
  onDeleteRequest,
  onOpenActivityLog,
}: MoreActionsDialogProps) {
  const canReactivate = policy.status === 'cancelled';
  const canCancel = policy.status !== 'cancelled';

  return (
    <AppBottomSheet
      title={(policy as any).customer?.name || '-'}
      subtitle={
        <p className="text-xs text-secondary-500 font-mono mt-0.5">#{policy.policy_number}</p>
      }
      onClose={onClose}
    >
      <button
        onClick={() => onEdit(policy)}
        className="dropdown-item w-full"
      >
        <Edit2 className="w-4 h-4" />
        <span>تعديل الوثيقة</span>
      </button>
      <button
        onClick={() => onGoToPolicy(policy)}
        className="dropdown-item w-full"
      >
        <DollarSign className="w-4 h-4" />
        <span>تسجيل سداد</span>
      </button>
      <button
        onClick={() => onGoToPolicy(policy)}
        className="dropdown-item w-full"
      >
        <ListChecks className="w-4 h-4" />
        <span>عرض الأقساط</span>
      </button>
      <button
        onClick={() => onPrint(policy)}
        className="dropdown-item w-full"
      >
        <Printer className="w-4 h-4" />
        <span>طباعة الوثيقة</span>
      </button>
      {canReactivate && (
        <button
          onClick={() => onReactivate(policy)}
          className="dropdown-item w-full text-success-600"
        >
          <RotateCcw className="w-4 h-4" />
          <span>إعادة تفعيل</span>
        </button>
      )}
      {canCancel && (
        <button
          onClick={() => onCancelPolicy(policy)}
          className="dropdown-item w-full text-error-600"
        >
          <XCircle className="w-4 h-4" />
          <span>إلغاء الوثيقة</span>
        </button>
      )}
      {canDelete ? (
        <button
          onClick={() => onDeleteRequest(policy)}
          className="dropdown-item w-full text-error-600"
        >
          <Trash2 className="w-4 h-4" />
          <span>حذف الوثيقة</span>
        </button>
      ) : (
        <div
          className="dropdown-item w-full text-secondary-300 cursor-not-allowed"
          title="لا يمكن الحذف: توجد دفعات من شهور سابقة"
        >
          <Trash2 className="w-4 h-4" />
          <span>حذف الوثيقة</span>
        </div>
      )}
      <div className="border-t border-secondary-100 my-1" />
      <button
        onClick={onOpenActivityLog}
        className="dropdown-item w-full"
      >
        <History className="w-4 h-4" />
        <span>سجل العمليات</span>
      </button>
    </AppBottomSheet>
  );
}
