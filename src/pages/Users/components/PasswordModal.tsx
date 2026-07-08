import { X, Lock, Eye, EyeOff } from 'lucide-react';
import clsx from 'clsx';
import type { UseFormRegister, UseFormHandleSubmit, FieldErrors } from 'react-hook-form';
import type { User } from '../../../lib/supabase';
import type { PasswordFormData } from '../types';

interface PasswordModalProps {
  editingUser: User;
  savingPwd: boolean;
  showPwd: boolean;
  showConfirmPwd: boolean;
  setShowPwd: (updater: (v: boolean) => boolean) => void;
  setShowConfirmPwd: (updater: (v: boolean) => boolean) => void;
  register: UseFormRegister<PasswordFormData>;
  handleSubmit: UseFormHandleSubmit<PasswordFormData>;
  errors: FieldErrors<PasswordFormData>;
  onSubmit: (data: PasswordFormData) => void;
  onClose: () => void;
}

export function PasswordModal({
  editingUser, savingPwd, showPwd, showConfirmPwd,
  setShowPwd, setShowConfirmPwd, register, handleSubmit, errors, onSubmit, onClose,
}: PasswordModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-md animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-secondary-200">
          <div>
            <h3 className="text-lg font-semibold text-secondary-900">تغيير كلمة المرور</h3>
            <p className="text-sm text-secondary-500 mt-0.5">{editingUser.name}</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100">
            <X className="w-5 h-5 text-secondary-600" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">

          {/* New password */}
          <div className="form-group">
            <label className="input-label">كلمة المرور الجديدة *</label>
            <div className="relative">
              <input
                {...register('password')}
                type={showPwd ? 'text' : 'password'}
                dir="ltr"
                className={clsx('input-field pl-10 pr-10', errors.password && 'border-error-500')}
                placeholder="أدخل كلمة المرور الجديدة"
                autoComplete="new-password"
              />
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
              <button
                type="button"
                onClick={() => setShowPwd((v) => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400 hover:text-secondary-600"
              >
                {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.password && (
              <p className="text-sm text-error-600 mt-1">{errors.password.message}</p>
            )}
          </div>

          {/* Confirm password */}
          <div className="form-group">
            <label className="input-label">تأكيد كلمة المرور *</label>
            <div className="relative">
              <input
                {...register('confirmPassword')}
                type={showConfirmPwd ? 'text' : 'password'}
                dir="ltr"
                className={clsx('input-field pl-10 pr-10', errors.confirmPassword && 'border-error-500')}
                placeholder="أعد إدخال كلمة المرور"
                autoComplete="new-password"
              />
              <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
              <button
                type="button"
                onClick={() => setShowConfirmPwd((v) => !v)}
                className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400 hover:text-secondary-600"
              >
                {showConfirmPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {errors.confirmPassword && (
              <p className="text-sm text-error-600 mt-1">{errors.confirmPassword.message}</p>
            )}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-4 border-t border-secondary-200">
            <button type="button" onClick={onClose} className="btn btn-secondary">
              إلغاء
            </button>
            <button type="submit" disabled={savingPwd} className="btn btn-primary">
              {savingPwd ? (
                <>
                  <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>جاري التغيير...</span>
                </>
              ) : (
                <>
                  <Lock className="w-4 h-4" />
                  <span>تغيير كلمة المرور</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
