import clsx from 'clsx';
import { X, ChevronDown, Phone } from 'lucide-react';
import type { UseFormRegister, UseFormHandleSubmit, FieldErrors } from 'react-hook-form';
import { POLICY_TYPE_LABELS, PAYMENT_METHOD_LABELS, type Policy } from '../../../../lib/supabase';
import type { PolicyFormData } from '../../types';
import type { CustomerPickerItem } from '../../services/policiesService';

interface PolicyFormDialogProps {
  editingPolicy: Policy | null;
  presetCustomerId: string | null;
  selectedCustomer: CustomerPickerItem | null;
  // لما تبقى true: مبلغ التأمين وطريقة السداد اترصدوا تلقائياً من بيانات
  // "طلب التأمين" المسجلة مع العميل المختار، فيتقفلوا للعرض فقط (راجع
  // usePolicyActions.customerDefaultsLocked)
  customerDefaultsLocked?: boolean;
  onOpenCustomerPicker: () => void;
  register: UseFormRegister<PolicyFormData>;
  handleSubmit: UseFormHandleSubmit<PolicyFormData>;
  onSubmit: (data: PolicyFormData) => void | Promise<void>;
  errors: FieldErrors<PolicyFormData>;
  saving: boolean;
  onClose: () => void;
}

// نفس مودال "إصدار/تعديل وثيقة" الموجود فى index.tsx الأصلي بالضبط — مودال
// واحد مشترك للإصدار والتعديل (العنوان ونص الزر فقط هما اللي بيتغيروا حسب
// editingPolicy)، بدون أي تغيير فى التصميم أو الحقول أو الـ Validation.
export function PolicyFormDialog({
  editingPolicy,
  presetCustomerId,
  selectedCustomer,
  customerDefaultsLocked,
  onOpenCustomerPicker,
  register,
  handleSubmit,
  onSubmit,
  errors,
  saving,
  onClose,
}: PolicyFormDialogProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-2xl animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-secondary-200">
          <h3 className="text-lg font-semibold text-secondary-900">
            {editingPolicy ? 'تعديل الوثيقة' : 'إصدار وثيقة جديدة'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-secondary-100"
          >
            <X className="w-5 h-5 text-secondary-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="input-label">رقم الوثيقة *</label>
              <input
                {...register('policy_number')}
                className={clsx('input-field', errors.policy_number && 'border-error-500')}
                placeholder="أدخل رقم الوثيقة"
              />
              {errors.policy_number && (
                <p className="text-sm text-error-600 mt-1">{errors.policy_number.message}</p>
              )}
            </div>

            <div className="form-group">
              <label className="input-label">العميل *</label>
              <input type="hidden" {...register('customer_id')} />
              <button
                type="button"
                disabled={!!presetCustomerId}
                onClick={onOpenCustomerPicker}
                className={clsx(
                  'input-field flex items-center justify-between gap-2 text-right',
                  errors.customer_id && 'border-error-500',
                  presetCustomerId && 'bg-secondary-50 text-secondary-600 cursor-not-allowed'
                )}
              >
                {selectedCustomer ? (
                  <span className="min-w-0 flex-1 flex flex-col items-start">
                    <span className="truncate font-medium text-secondary-900">{selectedCustomer.name}</span>
                    {selectedCustomer.phone && (
                      <span className="text-xs text-secondary-500 flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {selectedCustomer.phone}
                      </span>
                    )}
                  </span>
                ) : (
                  <span className="text-secondary-400">اختر العميل</span>
                )}
                {!presetCustomerId && (
                  <ChevronDown className="w-4 h-4 text-secondary-400 shrink-0" />
                )}
              </button>
              {presetCustomerId && (
                <p className="text-xs text-secondary-400 mt-1">
                  تم تحديد العميل من صفحة العملاء — الوثيقة ستكون تابعة لنفس وكيله تلقائياً
                </p>
              )}
              {errors.customer_id && (
                <p className="text-sm text-error-600 mt-1">{errors.customer_id.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="input-label">نوع الوثيقة *</label>
              <select
                {...register('policy_type')}
                className="input-field"
              >
                {Object.entries(POLICY_TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="input-label">تاريخ البداية *</label>
              <input
                {...register('start_date')}
                type="date"
                className={clsx('input-field', errors.start_date && 'border-error-500')}
              />
              {errors.start_date && (
                <p className="text-sm text-error-600 mt-1">{errors.start_date.message}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="input-label">طريقة السداد *</label>
              {customerDefaultsLocked ? (
                <>
                  <input type="hidden" {...register('payment_method')} />
                  <div className="input-field bg-secondary-50 text-secondary-600 cursor-not-allowed">
                    {PAYMENT_METHOD_LABELS[selectedCustomer!.payment_method as keyof typeof PAYMENT_METHOD_LABELS]}
                  </div>
                  <p className="text-xs text-secondary-400 mt-1">تم تعبئتها تلقائياً من بيانات طلب التأمين الخاصة بالعميل</p>
                </>
              ) : (
                <select
                  {...register('payment_method')}
                  className="input-field"
                >
                  {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              )}
            </div>

            <div className="form-group">
              <label className="input-label">قيمة القسط الصافي *</label>
              <div className="relative">
                <input
                  {...register('premium_amount', { valueAsNumber: true })}
                  type="number"
                  min="0"
                  className={clsx('input-field pl-16', errors.premium_amount && 'border-error-500')}
                  placeholder="أدخل قيمة القسط الصافي"
                />
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400 text-sm">
                  جنيه
                </span>
              </div>
              {errors.premium_amount && (
                <p className="text-sm text-error-600 mt-1">{errors.premium_amount.message}</p>
              )}
            </div>
          </div>

          <div className="form-group">
            <label className="input-label">
              مبلغ التأمين {!editingPolicy && '*'}
            </label>
            {customerDefaultsLocked ? (
              <>
                <input type="hidden" {...register('sum_assured', { valueAsNumber: true })} />
                <div className="relative">
                  <div className="input-field pl-16 bg-secondary-50 text-secondary-600 cursor-not-allowed">
                    {selectedCustomer!.insurance_amount}
                  </div>
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400 text-sm">
                    جنيه
                  </span>
                </div>
                <p className="text-xs text-secondary-400 mt-1">تم تعبئته تلقائياً من بيانات طلب التأمين الخاصة بالعميل</p>
              </>
            ) : (
              <>
                <div className="relative">
                  <input
                    {...register('sum_assured', { valueAsNumber: true })}
                    type="number"
                    min="0"
                    className={clsx('input-field pl-16', errors.sum_assured && 'border-error-500')}
                    placeholder="أدخل مبلغ التأمين"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400 text-sm">
                    جنيه
                  </span>
                </div>
                {errors.sum_assured && (
                  <p className="text-sm text-error-600 mt-1">{errors.sum_assured.message}</p>
                )}
              </>
            )}
          </div>

          <div className="form-group">
            <label className="input-label">ملاحظات</label>
            <textarea
              {...register('notes')}
              className="input-field min-h-[80px] resize-none"
              placeholder="أدخل ملاحظات (اختياري)"
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-secondary-200">
            <button
              type="button"
              onClick={onClose}
              className="btn btn-secondary"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary"
            >
              {saving ? 'جاري الحفظ...' : editingPolicy ? 'حفظ التعديلات' : 'إصدار الوثيقة'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
