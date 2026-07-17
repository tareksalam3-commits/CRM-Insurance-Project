import clsx from 'clsx';
import { X, User as UserIcon, Phone, MapPin } from 'lucide-react';
import type { UseFormRegister, UseFormHandleSubmit, UseFormSetValue, FieldErrors } from 'react-hook-form';
import { MARITAL_STATUS_LABELS, type User } from '../../../../lib/supabase';
import type { CustomerFormData, CustomerWithRelations } from '../../types';
import { AgentCombobox } from '../AgentCombobox';

interface CustomerFormDialogProps {
  editingCustomer: CustomerWithRelations | null;
  isManagerRole: boolean;
  agents: any[];
  user: User | null | undefined;
  register: UseFormRegister<CustomerFormData>;
  handleSubmit: UseFormHandleSubmit<CustomerFormData>;
  onSubmit: (data: CustomerFormData) => void | Promise<void>;
  errors: FieldErrors<CustomerFormData>;
  ownerIdValue: string | undefined;
  setValue: UseFormSetValue<CustomerFormData>;
  saving: boolean;
  onClose: () => void;
}

// نفس مودال "إضافة/تعديل عميل" الموجود فى index.tsx الأصلي بالضبط — الصفحة
// الأصلية تستخدم مودال واحد مشترك للإضافة والتعديل (العنوان ونص الزر فقط هما
// اللي بيتغيروا حسب editingCustomer)، فمكوّن EditCustomerDialog يعيد
// استخدام نفس هذا المكوّن بدل تكرار نفس الفورم فى ملفين منفصلين.
export function CustomerFormDialog({
  editingCustomer,
  isManagerRole,
  agents,
  user,
  register,
  handleSubmit,
  onSubmit,
  errors,
  ownerIdValue,
  setValue,
  saving,
  onClose,
}: CustomerFormDialogProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-secondary-200">
          <h3 className="text-lg font-semibold text-secondary-900">
            {editingCustomer ? 'تعديل العميل' : 'إضافة عميل جديد'}
          </h3>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-secondary-100"
          >
            <X className="w-5 h-5 text-secondary-600" />
          </button>
        </div>

        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
          <div className="form-group">
            <label className="input-label">الاسم *</label>
            <div className="relative">
              <input
                {...register('name')}
                className={clsx('input-field', errors.name && 'border-error-500')}
                placeholder="أدخل اسم العميل"
              />
              <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
            </div>
            {errors.name && (
              <p className="text-sm text-error-600 mt-1">{errors.name.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="input-label">الرقم القومي</label>
              <input
                {...register('national_id')}
                className="input-field"
                placeholder="أدخل الرقم القومي"
                dir="ltr"
              />
            </div>

            <div className="form-group">
              <label className="input-label">رقم الهاتف</label>
              <div className="relative">
                <input
                  {...register('phone')}
                  className="input-field pl-10"
                  placeholder="01xxxxxxxxx"
                  dir="ltr"
                />
                <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
              </div>
            </div>
          </div>

          <div className="form-group">
            <label className="input-label">العنوان</label>
            <div className="relative">
              <input
                {...register('address')}
                className="input-field"
                placeholder="أدخل العنوان"
              />
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="input-label">تاريخ الميلاد</label>
              <input
                {...register('birth_date')}
                type="date"
                className="input-field"
              />
            </div>

            <div className="form-group">
              <label className="input-label">المهنة</label>
              <input
                {...register('occupation')}
                className="input-field"
                placeholder="أدخل المهنة"
              />
            </div>
          </div>

          <div className="form-group">
            <label className="input-label">الحالة الاجتماعية</label>
            <select {...register('marital_status')} className="input-field">
              <option value="">اختر الحالة</option>
              {Object.entries(MARITAL_STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>{label}</option>
              ))}
            </select>
          </div>

          {isManagerRole && (
            <div className="form-group">
              <label className="input-label">الوكيل المسؤول *</label>
              <input type="hidden" {...register('owner_id')} />
              <AgentCombobox
                agents={agents}
                value={ownerIdValue || ''}
                onChange={(id) => setValue('owner_id', id, { shouldValidate: true })}
                currentUserId={user?.id}
                placeholder="اختر الوكيل"
                hasError={!!errors.owner_id}
              />
              {agents.length === 0 && (
                <p className="text-xs text-secondary-400 mt-1">لا يوجد أعضاء في فريقك حالياً</p>
              )}
              {errors.owner_id && (
                <p className="text-sm text-error-600 mt-1">{errors.owner_id.message}</p>
              )}
            </div>
          )}

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
              {saving ? 'جاري الحفظ...' : 'حفظ'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// alias مطابق لاسم الملف — يُستخدم فى حالة "إضافة عميل جديد" (editingCustomer === null)
export const AddCustomerDialog = CustomerFormDialog;
