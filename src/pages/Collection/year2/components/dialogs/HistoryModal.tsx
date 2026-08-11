import { X, XCircle } from 'lucide-react';
import { format } from 'date-fns';
import type { Year2EligiblePolicy, Year2Payment } from '../../types';

interface HistoryModalProps {
  policy: Year2EligiblePolicy;
  history: Year2Payment[];
  loadingHistory: boolean;
  formatCurrency: (value: number) => string;
  onCancelPayment: (payment: Year2Payment) => void;
  onClose: () => void;
}

// ===== مودال سجل التحصيل =====
export function HistoryModal({
  policy, history, loadingHistory, formatCurrency, onCancelPayment, onClose,
}: HistoryModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-2xl animate-fadeIn" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-secondary-200">
          <h3 className="text-lg font-semibold text-secondary-900">
            سجل تحصيل السنوات اللاحقة: {policy.policy_number}
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100">
            <X className="w-5 h-5 text-secondary-600" />
          </button>
        </div>
        <div className="p-6">
          {loadingHistory ? (
            <div className="flex items-center justify-center h-48">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
            </div>
          ) : history.length === 0 ? (
            <p className="text-center text-secondary-500 py-12">لا توجد تحصيلات مسجلة بعد</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-secondary-200">
                    <th className="text-right py-2 px-3">تاريخ التحصيل</th>
                    <th className="text-right py-2 px-3">المبلغ</th>
                    <th className="text-right py-2 px-3">بواسطة</th>
                    <th className="text-right py-2 px-3">الحالة</th>
                    <th className="text-center py-2 px-3">إجراء</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => (
                    <tr key={h.id} className="border-b border-secondary-100 hover:bg-secondary-50">
                      <td className="py-3 px-3">{format(new Date(h.payment_date), 'dd/MM/yyyy')}</td>
                      <td className="py-3 px-3 font-semibold">{formatCurrency(h.amount)}</td>
                      <td className="py-3 px-3">{h.paid_by?.name || '-'}</td>
                      <td className="py-3 px-3">
                        <span className={`badge ${h.is_cancelled ? 'badge-error' : 'badge-success'}`}>
                          {h.is_cancelled ? 'ملغى' : 'مسدد'}
                        </span>
                      </td>
                      <td className="py-3 px-3 text-center">
                        {!h.is_cancelled && (
                          <button onClick={() => onCancelPayment(h)} className="btn btn-secondary btn-sm" title="إلغاء">
                            <XCircle className="w-4 h-4" />
                            <span>إلغاء</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="flex justify-end gap-3 p-6 border-t border-secondary-200">
          <button onClick={onClose} className="btn btn-secondary">إغلاق</button>
        </div>
      </div>
    </div>
  );
}
