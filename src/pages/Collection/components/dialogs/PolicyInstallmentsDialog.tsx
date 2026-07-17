import { X } from 'lucide-react';
import type { Policy, Installment } from '../../../../lib/supabase';
import { InstallmentsTable } from '../../../../features/installments/InstallmentsTable';

interface PolicyInstallmentsDialogProps {
  policy: Policy;
  installments: Installment[];
  loading: boolean;
  onClose: () => void;
  onPay: (installment: Installment) => void;
  onCancel: (installment: Installment) => void;
}

// ===== مودال جميع أقساط الوثيقة (سجل التحصيل) =====
export function PolicyInstallmentsDialog({
  policy,
  installments,
  loading,
  onClose,
  onPay,
  onCancel,
}: PolicyInstallmentsDialogProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-2xl animate-fadeIn max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-secondary-200 sticky top-0 bg-white z-10">
          <h3 className="text-lg font-semibold text-secondary-900">
            جميع أقساط الوثيقة: {policy.policy_number}
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100">
            <X className="w-5 h-5 text-secondary-600" />
          </button>
        </div>
        <div className="p-6">
          <InstallmentsTable
            installments={installments}
            loading={loading}
            onPay={onPay}
            onCancel={onCancel}
          />
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-secondary-200">
          <button onClick={onClose} className="btn btn-secondary">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
