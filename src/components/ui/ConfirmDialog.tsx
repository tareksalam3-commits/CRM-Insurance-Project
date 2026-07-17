import type { ReactNode } from 'react';
import { Trash2, type LucideIcon } from 'lucide-react';
import { AppDialog } from './AppDialog';

interface ConfirmDialogProps {
  icon?: LucideIcon;
  title: string;
  message: ReactNode;
  /** سطر تحذيرى اختياري إضافي يظهر أسفل الرسالة (بلون warning) */
  warning?: ReactNode;
  confirmLabel?: string;
  confirmBusyLabel?: string;
  cancelLabel?: string;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * مودال تأكيد عام (أيقونة دائرية + عنوان + رسالة + زرّا إلغاء/تأكيد).
 * استُخرج من الأنماط المتطابقة فى تأكيد حذف العميل والوثيقة.
 * لا يحمل أى منطق عمل — الرسائل والحالة (busy) تُمرَّر من الصفحة كما كانت تمامًا.
 */
export function ConfirmDialog({
  icon: Icon = Trash2,
  title,
  message,
  warning,
  confirmLabel = 'حذف',
  confirmBusyLabel = 'جاري الحذف...',
  cancelLabel = 'إلغاء',
  busy = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  return (
    <AppDialog onClose={onClose} className="max-w-sm animate-fadeIn">
      <div className="p-6 text-center">
        <div className="w-12 h-12 rounded-full bg-error-100 flex items-center justify-center mx-auto mb-4">
          <Icon className="w-6 h-6 text-error-600" />
        </div>
        <h3 className="text-lg font-semibold text-secondary-900 mb-2">{title}</h3>
        <p className={warning ? 'text-secondary-600 mb-2' : 'text-secondary-600 mb-6'}>{message}</p>
        {warning && <p className="text-sm text-warning-600 mb-6">{warning}</p>}
        <div className="flex justify-center gap-3">
          <button onClick={onClose} className="btn btn-secondary" disabled={busy}>
            {cancelLabel}
          </button>
          <button onClick={onConfirm} className="btn btn-error" disabled={busy}>
            {busy ? confirmBusyLabel : confirmLabel}
          </button>
        </div>
      </div>
    </AppDialog>
  );
}
