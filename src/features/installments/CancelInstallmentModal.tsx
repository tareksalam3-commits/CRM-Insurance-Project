import { X, XCircle } from 'lucide-react';
import { format } from 'date-fns';

import type { Installment } from '../../lib/supabase';
import { formatCurrency } from './installmentHelpers';

// ===================================
// مودال إلغاء السداد الموحّد — نفس المودال فى كل الشاشات (راجع تعليق
// PayInstallmentModal لنفس فكرة contextLabel الاختياري)
// ===================================
interface CancelInstallmentModalProps {
  installment: Installment;
  contextLabel?: { policyNumber?: string; customerName?: string };
  cancelReason: string;
  onCancelReasonChange: (value: string) => void;
  processing: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function CancelInstallmentModal({
  installment,
  contextLabel,
  cancelReason,
  onCancelReasonChange,
  processing,
  onConfirm,
  onClose,
}: CancelInstallmentModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md animate-fadeIn" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-secondary-200">
          <h3 className="text-lg font-semibold text-secondary-900">إلغاء السداد</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100">
            <X className="w-5 h-5 text-secondary-600" />
          </button>
        </div>

        <div className="p-6">
          <div className="bg-error-50 rounded-lg p-4 mb-4 space-y-2">
            <p className="text-sm text-error-700 font-medium">هل أنت متأكد من إلغاء هذا السداد؟</p>
            {contextLabel?.policyNumber && (
              <div className="flex justify-between text-sm">
                <span className="text-secondary-600">رقم الوثيقة</span>
                <span className="font-medium">{contextLabel.policyNumber}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-secondary-600">القسط رقم</span>
              <span className="font-medium">{installment.installment_number}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-secondary-600">تاريخ الاستحقاق</span>
              <span className="font-medium">{format(new Date(installment.due_date), 'dd/MM/yyyy')}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-secondary-600">المبلغ</span>
              <span className="font-medium">{formatCurrency(installment.amount)}</span>
            </div>
          </div>

          <div className="form-group mb-4">
            <label className="input-label">سبب الإلغاء</label>
            <input
              value={cancelReason}
              onChange={(e) => onCancelReasonChange(e.target.value)}
              className="input-field"
              placeholder="أدخل سبب الإلغاء (اختياري)"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={onClose} className="btn btn-secondary">
              تراجع
            </button>
            <button onClick={onConfirm} disabled={processing} className="btn btn-error">
              {processing ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                  <span>جاري الإلغاء...</span>
                </>
              ) : (
                <>
                  <XCircle className="w-4 h-4" />
                  <span>تأكيد الإلغاء</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
