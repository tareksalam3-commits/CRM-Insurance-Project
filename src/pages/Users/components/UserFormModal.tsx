import { X, Mail, Phone, Save } from 'lucide-react';
import clsx from 'clsx';
import type { UseFormRegister, UseFormHandleSubmit, FieldErrors } from 'react-hook-form';
import { ROLE_LABELS, type User, type UserRole } from '../../../lib/supabase';
import type { UserFormData } from '../types';
import type { UserBranchRoleRow } from '../../../features/branches/types';
import { UserBranchRolesSection } from './UserBranchRolesSection';

interface UserFormModalProps {
  editingUser: User | null;
  saving: boolean;
  register: UseFormRegister<UserFormData>;
  handleSubmit: UseFormHandleSubmit<UserFormData>;
  errors: FieldErrors<UserFormData>;
  selectedRole: UserRole | undefined;
  allowedManagers: User[];
  // الدرجات الوظيفية المسموح للمستخدم الحالي إنشاءها/إسنادها (نظام هرمي)
  allowedRoles: UserRole[];
  // فروع المدير المختار — بيوصل غير فاضي بس لو المدير له أكثر من فرع (مشكلة 3)
  managerBranches: UserBranchRoleRow[];
  onSubmit: (data: UserFormData) => void;
  onClose: () => void;
}

export function UserFormModal({
  editingUser, saving, register, handleSubmit, errors,
  selectedRole, allowedManagers, allowedRoles, managerBranches, onSubmit, onClose,
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
                {allowedRoles.map((role) => (
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
              {selectedRole !== 'super_admin' && allowedManagers.length === 0 && (
                <p className="text-xs text-error-600 mt-1">
                  لا يوجد مدير مناسب متاح ضمن نطاقك الإداري لهذه الدرجة الوظيفية
                </p>
              )}
              {selectedRole !== 'super_admin' && (
                <p className="text-xs text-secondary-400 mt-1">
                  يمكن اختيار أي درجة وظيفية أعلى كمدير مباشر
                </p>
              )}
            </div>
          </div>

          {/* الفرع (مشكلة 3): يظهر فقط لو المدير المختار له أكثر من فرع —
              فى الحالات التانية الفرع بيتحدد تلقائيًا من فرع المدير */}
          {managerBranches.length > 0 && (
            <div className="form-group">
              <label className="input-label">الفرع *</label>
              <select {...register('branch_id')} className="input-field">
                <option value="">اختر الفرع</option>
                {managerBranches.map((r) => (
                  <option key={r.branch_id} value={r.branch_id}>
                    {r.branch?.name ?? r.branch_id}
                  </option>
                ))}
              </select>
              <p className="text-xs text-secondary-400 mt-1">
                المدير المختار له أكثر من فرع، يجب تحديد فرع المستخدم الجديد صراحة
              </p>
            </div>
          )}

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

          {/* الأوضاع الوظيفية (الفروع) — لمستخدم موجود بالفعل بس (له id) */}
          {editingUser && <UserBranchRolesSection userId={editingUser.id} />}

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
