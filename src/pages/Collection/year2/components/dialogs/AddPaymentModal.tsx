import { X, CheckCircle } from 'lucide-react';
import { format } from 'date-fns';
import clsx from 'clsx';
import type { UseFormRegister, UseFormHandleSubmit, FieldErrors } from 'react-hook-form';
import type { Year2EligiblePolicy, Year2PaymentFormData } from '../../types';

interface AddPaymentModalProps {
  policy: Year2EligiblePolicy;
  saving: boolean;
  register: UseFormRegister<Year2PaymentFormData>;
  handleSubmit: UseFormHandleSubmit<Year2PaymentFormData>;
  errors: FieldErrors<Year2PaymentFormData>;
  onSubmit: (data: Year2PaymentFormData) => void;
  onClose: () => void;
}

// ===== مودال تسجيل تحصيل =====
export function AddPaymentModal({
  policy, saving, register, handleSubmit, errors, onSubmit, onClose,
}: AddPaymentModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md animate-fadeIn" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-secondary-200">
          <h3 className="text-lg font-semibold text-secondary-900">تسجيل تحصيل سنة ثانية</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100">
            <X className="w-5 h-5 text-secondary-600" />
          </button>
        </div>
        <form onSubmit={handleSubmit(onSubmit)} className="p-6">
          <div className="bg-primary-50 rounded-lg p-4 mb-6 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-secondary-600">رقم الوثيقة</span>
              <span className="font-semibold">{policy.policy_number}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-secondary-600">العميل</span>
              <span className="font-semibold">{policy.customer?.name}</span>
            </div>
          </div>

          <div className="form-group mb-4">
            <label className="input-label">المبلغ المحصل</label>
            <input
              {...register('amount')}
              type="number"
              className={clsx('input-field', errors.amount && 'border-error-500')}
              placeholder="0"
              min="0"
            />
            {errors.amount && <p className="text-sm text-error-600 mt-1">{errors.amount.message}</p>}
          </div>

          <div className="form-group mb-4">
            <label className="input-label">تاريخ التحصيل</label>
            <input
              {...register('paymentDate')}
              type="date"
              max={format(new Date(), 'yyyy-MM-dd')}
              className={clsx('input-field', errors.paymentDate && 'border-error-500')}
            />
            {errors.paymentDate && <p className="text-sm text-error-600 mt-1">{errors.paymentDate.message}</p>}
          </div>

          <div className="form-group mb-4">
            <label className="input-label">ملاحظات (اختياري)</label>
            <input
              {...register('notes')}
              className="input-field"
              placeholder="ملاحظات"
            />
          </div>

          <div className="flex justify-end gap-3">
            <button type="button" onClick={onClose} className="btn btn-secondary">إلغاء</button>
            <button type="submit" disabled={saving} className="btn btn-success">
              {saving
                ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /><span>جاري التسجيل...</span></>
                : <><CheckCircle className="w-4 h-4" /><span>تأكيد التحصيل</span></>}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
