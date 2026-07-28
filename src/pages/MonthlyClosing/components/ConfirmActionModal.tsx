import clsx from 'clsx';
import { Lock, Unlock } from 'lucide-react';
import { fmt } from '../utils';

interface ConfirmActionModalProps {
  confirmAction: 'close' | 'open';
  monthLabel: string;
  grandProduction: number;
  grandCollection: number;
  grandTotal: number;
  processing: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

// مودال تأكيد تقفيل/فتح الشهر
export function ConfirmActionModal({
  confirmAction,
  monthLabel,
  grandProduction,
  grandCollection,
  grandTotal,
  processing,
  onClose,
  onConfirm,
}: ConfirmActionModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-sm animate-fadeIn" onClick={e => e.stopPropagation()}>
        <div className="p-6 text-center">
          <div className={clsx(
            'w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4',
            confirmAction === 'close' ? 'bg-primary-100' : 'bg-warning-100'
          )}>
            {confirmAction === 'close'
              ? <Lock className="w-6 h-6 text-primary-600" />
              : <Unlock className="w-6 h-6 text-warning-600" />}
          </div>
          <h3 className="text-lg font-semibold text-secondary-900 mb-2">
            {confirmAction === 'close' ? 'تأكيد التقفيل والاعتماد' : 'تأكيد فتح الشهر'}
          </h3>
          <p className="text-secondary-600 mb-2">
            {confirmAction === 'close'
              ? `هل أنت متأكد من تقفيل شهر ${monthLabel} باعتبار الأرقام المعروضة نهائية؟`
              : `هل أنت متأكد من فتح شهر ${monthLabel}؟`}
          </p>
          {confirmAction === 'close' && (
            <div className="text-sm bg-secondary-50 rounded-lg p-3 mb-4 text-right">
              <p className="text-secondary-600">إجمالي الإنتاج: <span className="font-bold text-success-600">{fmt(grandProduction)}</span></p>
              <p className="text-secondary-600">إجمالي التحصيل: <span className="font-bold text-info-600">{fmt(grandCollection)}</span></p>
              <p className="text-secondary-700 font-semibold">الإجمالي الكلي: <span className="text-primary-700">{fmt(grandTotal)}</span></p>
            </div>
          )}
          {confirmAction === 'close' && (
            <p className="text-xs text-warning-600 mb-4">
              بعد التقفيل لن يتمكن أي مستخدم من إضافة أو إلغاء مدفوعات لهذا الشهر.
            </p>
          )}
          <div className="flex justify-center gap-3">
            <button onClick={onClose} className="btn btn-secondary">إلغاء</button>
            <button
              onClick={onConfirm}
              disabled={processing}
              className={clsx('btn', confirmAction === 'close' ? 'btn-primary' : 'btn-warning')}
            >
              {processing
                ? <><div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" /><span>جاري...</span></>
                : <span>{confirmAction === 'close' ? 'تقفيل واعتماد' : 'فتح الشهر'}</span>}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
