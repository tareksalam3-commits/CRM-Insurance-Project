import { X, Mail, Phone, Save } from 'lucide-react';
import clsx from 'clsx';
import type { UseFormRegister, UseFormHandleSubmit, FieldErrors } from 'react-hook-form';
import { ROLE_LABELS, type User, type UserRole } from '../../../lib/supabase';
import { ROLES, type UserFormData } from '../types';
import { EXPECTED_PARENT } from '../business/roleHierarchy';

interface UserFormModalProps {
  editingUser: User | null;
  saving: boolean;
  register: UseFormRegister<UserFormData>;
  handleSubmit: UseFormHandleSubmit<UserFormData>;
  errors: FieldErrors<UserFormData>;
  selectedRole: UserRole | undefined;
  allowedManagers: User[];
  onSubmit: (data: UserFormData) => void;
  onClose: () => void;
}

export function UserFormModal({
  editingUser, saving, register, handleSubmit, errors,
  selectedRole, allowedManagers, onSubmit, onClose,
}: UserFormModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-lg animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-secondary-200">
          <h3 className="text-lg font-semibold text-secondary-900">
            {editingUser ? `تعديل: ${editingUser.name}` : 'إضافة مستخدم جديد'}
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100">
            <X className="w-5 h-5 text-secondary-600" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">

          {/* Name */}
          <div className="form-group">
            <label className="input-label">الاسم *</label>
            <input
              {...register('name')}
              className={clsx('input-field', errors.name && 'border-error-500')}
              placeholder="أدخل اسم المستخدم"
            />
            {errors.name && <p className="text-sm text-error-600 mt-1">{errors.name.message}</p>}
          </div>

          {/* Email */}
          <div className="form-group">
            <label className="input-label">البريد الإلكتروني *</label>
            <div className="relative">
              <input
                {...register('email')}
                type="email"
                dir="ltr"
                className={clsx('input-field pl-10', errors.email && 'border-error-500')}
                placeholder="example@company.com"
              />
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
            </div>
            {errors.email && <p className="text-sm text-error-600 mt-1">{errors.email.message}</p>}
            {editingUser && (
              <p className="text-xs text-secondary-400 mt-1">يمكنك تعديل البريد الإلكتروني</p>
            )}
          </div>

          {/* Phone */}
          <div className="form-group">
            <label className="input-label">رقم الهاتف</label>
            <div className="relative">
              <input
                {...register('phone')}
                dir="ltr"
                className="input-field pl-10"
                placeholder="01xxxxxxxxx"
              />
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
            </div>
          </div>

          {/* Role + Manager */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="input-label">الدرجة الوظيفية *</label>
              <select {...register('role')} className="input-field">
                {ROLES.map((role) => (
                  <option key={role} value={role}>
                    {ROLE_LABELS[role]}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label className="input-label">المدير المباشر</label>
              <select {...register('manager_id')} className="input-field">
                <option value="">بدون مدير</option>
                {allowedManagers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {ROLE_LABELS[u.role]}
                  </option>
                ))}
              </select>
              {selectedRole && EXPECTED_PARENT[selectedRole] && allowedManagers.length === 0 && (
                <p className="text-xs text-error-600 mt-1">
                  لا يوجد {ROLE_LABELS[EXPECTED_PARENT[selectedRole]!]} متاح — يجب إضافته أولاً
                </p>
              )}
              {selectedRole && EXPECTED_PARENT[selectedRole] && (
                <p className="text-xs text-secondary-400 mt-1">
                  يجب أن يكون المدير المباشر: {ROLE_LABELS[EXPECTED_PARENT[selectedRole]!]}
                </p>
              )}
            </div>
          </div>

          {/* Target */}
          <div className="form-group">
            <label className="input-label">التارجت الشهري</label>
            <div className="relative">
              <input
                {...register('target', { valueAsNumber: true })}
                type="number"
                min="0"
                className="input-field pl-16"
                placeholder="0"
              />
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400 text-sm">
                جنيه
              </span>
            </div>
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-secondary-200">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              إلغاء
            </button>
            <button type="submit" disabled={saving} className="btn btn-primary">
              {saving ? (
                <>
                  <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>جاري الحفظ...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>حفظ التغييرات</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
