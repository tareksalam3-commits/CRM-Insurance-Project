import { X, CheckCircle, AlertTriangle } from 'lucide-react';
import { format, startOfMonth } from 'date-fns';
import { ar } from 'date-fns/locale';

import type { Installment } from '../../lib/supabase';
import { isEarlyPayment, formatCurrency } from './installmentHelpers';

// ===================================
// مودال تأكيد السداد الموحّد — يُعاد استخدامه فى كل الشاشات التي تسدد قسطاً
// (التحصيل والسداد / تفاصيل الوثيقة / صفحة العملاء). contextLabel اختياري
// لعرض رقم الوثيقة/اسم العميل عندما لا يكون السياق واضحاً من الشاشة نفسها
// (مثل قائمة التحصيل العامة التي تجمع أقساط أكثر من وثيقة).
// ===================================
interface PayInstallmentModalProps {
  installment: Installment;
  contextLabel?: { policyNumber?: string; customerName?: string };
  paymentDateStr: string;
  onPaymentDateChange: (value: string) => void;
  processing: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function PayInstallmentModal({
  installment,
  contextLabel,
  paymentDateStr,
  onPaymentDateChange,
  processing,
  onConfirm,
  onClose,
}: PayInstallmentModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md animate-fadeIn" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-secondary-200">
          <h3 className="text-lg font-semibold text-secondary-900">تأكيد السداد</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100">
            <X className="w-5 h-5 text-secondary-600" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {isEarlyPayment(installment) && (
            <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-sm font-medium text-blue-700">سداد مبكر</p>
                <p className="text-xs text-blue-600 mt-0.5">
                  تاريخ استحقاق هذا القسط {format(new Date(installment.due_date), 'dd/MM/yyyy')} — سيُسجَّل
                  السداد في شهر {format(startOfMonth(new Date(paymentDateStr)), 'MMMM yyyy', { locale: ar })}.
                </p>
              </div>
            </div>
          )}

          <div className="form-group">
            <label className="input-label">تاريخ السداد</label>
            <input
              type="date"
              value={paymentDateStr}
              max={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => onPaymentDateChange(e.target.value)}
              className="input-field"
            />
            <p className="text-xs text-secondary-400 mt-1">
              سيُحسب السداد ضمن تارجت شهر{' '}
              {format(startOfMonth(new Date(paymentDateStr)), 'MMMM yyyy', { locale: ar })}
            </p>
          </div>

          <div className="bg-secondary-50 rounded-xl p-4 space-y-3">
            {contextLabel?.policyNumber && (
              <div className="flex justify-between text-sm">
                <span className="text-secondary-500">رقم الوثيقة</span>
                <span className="font-medium">{contextLabel.policyNumber}</span>
              </div>
            )}
            {contextLabel?.customerName && (
              <div className="flex justify-between text-sm">
                <span className="text-secondary-500">العميل</span>
                <span className="font-medium">{contextLabel.customerName}</span>
              </div>
            )}
            <div className="flex justify-between text-sm">
              <span className="text-secondary-500">رقم القسط</span>
              <span className="font-medium">{installment.installment_number}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-secondary-500">تاريخ الاستحقاق</span>
              <span className="font-medium">{format(new Date(installment.due_date), 'dd/MM/yyyy')}</span>
            </div>
            <div className="flex justify-between text-sm border-t border-secondary-200 pt-3">
              <span className="text-secondary-700 font-semibold">المبلغ المستحق</span>
              <span className="font-bold text-primary-700 text-base">{formatCurrency(installment.amount)}</span>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 pb-6">
          <button onClick={onClose} className="btn btn-secondary" disabled={processing}>
            إلغاء
          </button>
          <button onClick={onConfirm} disabled={processing} className="btn btn-primary">
            {processing ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                <span>جاري التسجيل...</span>
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                <span>تأكيد السداد</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
