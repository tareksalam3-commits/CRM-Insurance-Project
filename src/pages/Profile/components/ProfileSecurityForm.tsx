import {
  Fingerprint, Lock, Key, Eye, EyeOff, Loader2, CheckCircle2, XCircle,
} from 'lucide-react';
import clsx from 'clsx';
import type { UseFormRegister, UseFormHandleSubmit, FieldErrors } from 'react-hook-form';
import type { PasswordFormData, StatusMessage } from '../types';

interface ProfileSecurityFormProps {
  passkeySupported: boolean;
  passkeyMessage: StatusMessage | null;
  registeringPasskey: boolean;
  onRegisterPasskey: () => void;
  registerPassword: UseFormRegister<PasswordFormData>;
  handlePasswordSubmit: UseFormHandleSubmit<PasswordFormData>;
  passwordErrors: FieldErrors<PasswordFormData>;
  onPasswordSubmit: (data: PasswordFormData) => void | Promise<void>;
  showCurrentPassword: boolean;
  setShowCurrentPassword: (value: boolean) => void;
  showNewPassword: boolean;
  setShowNewPassword: (value: boolean) => void;
  passwordStrength: number;
  passwordMessage: StatusMessage | null;
  savingPassword: boolean;
}

export function ProfileSecurityForm({
  passkeySupported,
  passkeyMessage,
  registeringPasskey,
  onRegisterPasskey,
  registerPassword,
  handlePasswordSubmit,
  passwordErrors,
  onPasswordSubmit,
  showCurrentPassword,
  setShowCurrentPassword,
  showNewPassword,
  setShowNewPassword,
  passwordStrength,
  passwordMessage,
  savingPassword,
}: ProfileSecurityFormProps) {
  return (
    <div className="space-y-6">
      {passkeySupported && (
        <div className="card">
          <div className="flex items-center gap-3 mb-5">
            <div className="p-2 bg-primary-50 rounded-lg text-primary-600">
              <Fingerprint className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base md:text-lg font-bold text-secondary-900">الدخول بالبصمة</h3>
              <p className="text-sm text-secondary-500">سجّل بصمة جهازك للدخول بدون كتابة كلمة المرور في كل مرة</p>
            </div>
          </div>

          {passkeyMessage && (
            <div className={clsx(
              'p-4 rounded-lg text-sm flex items-center gap-3 mb-4',
              passkeyMessage.type === 'success'
                ? 'bg-success-50 text-success-700 border border-success-100'
                : 'bg-error-50 text-error-700 border border-error-100'
            )}>
              {passkeyMessage.type === 'success'
                ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                : <XCircle className="w-4 h-4 shrink-0" />
              }
              {passkeyMessage.text}
            </div>
          )}

          <button
            type="button"
            onClick={onRegisterPasskey}
            disabled={registeringPasskey}
            className="btn btn-primary shadow-sm"
          >
            {registeringPasskey ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
            <span>تسجيل بصمة هذا الجهاز</span>
          </button>
        </div>
      )}

      <div className="card">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-primary-50 rounded-lg text-primary-600">
            <Lock className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-base md:text-lg font-bold text-secondary-900">الأمان وكلمة المرور</h3>
            <p className="text-sm text-secondary-500">حافظ على أمان حسابك بتحديث كلمة المرور</p>
          </div>
        </div>

        <form onSubmit={handlePasswordSubmit(onPasswordSubmit)} className="space-y-4 max-w-2xl">
          <div className="form-group">
            <label className="input-label">كلمة المرور الحالية</label>
            <div className="relative">
              <input
                {...registerPassword('currentPassword')}
                type={showCurrentPassword ? 'text' : 'password'}
                className={clsx(
                  'input-field pr-11 pl-12',
                  passwordErrors.currentPassword && 'border-error-500'
                )}
              />
              <Key className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
              <button
                type="button"
                onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary-400 hover:text-secondary-600"
              >
                {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>
            {passwordErrors.currentPassword && (
              <p className="text-sm text-error-600 mt-1">{passwordErrors.currentPassword.message}</p>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="form-group">
              <label className="input-label">كلمة المرور الجديدة</label>
              <div className="relative">
                <input
                  {...registerPassword('newPassword')}
                  type={showNewPassword ? 'text' : 'password'}
                  className={clsx(
                    'input-field pr-11 pl-12',
                    passwordErrors.newPassword && 'border-error-500'
                  )}
                />
                <Key className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute left-4 top-1/2 -translate-y-1/2 text-secondary-400 hover:text-secondary-600"
                >
                  {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
              {passwordErrors.newPassword && (
                <p className="text-sm text-error-600 mt-1">{passwordErrors.newPassword.message}</p>
              )}
            </div>

            <div className="form-group">
              <label className="input-label">تأكيد كلمة المرور</label>
              <div className="relative">
                <input
                  {...registerPassword('confirmPassword')}
                  type="password"
                  className={clsx(
                    'input-field pr-11',
                    passwordErrors.confirmPassword && 'border-error-500'
                  )}
                />
                <Key className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
              </div>
              {passwordErrors.confirmPassword && (
                <p className="text-sm text-error-600 mt-1">{passwordErrors.confirmPassword.message}</p>
              )}
            </div>
          </div>

          {/* Password Strength Indicator */}
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-xs font-medium text-secondary-500">قوة كلمة المرور</span>
              <span className={clsx(
                'text-xs font-bold',
                passwordStrength <= 25 ? 'text-error-600' : passwordStrength <= 50 ? 'text-warning-600' : passwordStrength <= 75 ? 'text-info-600' : 'text-success-600'
              )}>
                {passwordStrength <= 25 ? 'ضعيفة' : passwordStrength <= 50 ? 'متوسطة' : passwordStrength <= 75 ? 'جيدة' : 'قوية جداً'}
              </span>
            </div>
            <div className="h-1.5 w-full bg-secondary-100 rounded-full overflow-hidden">
              <div
                className={clsx(
                  'h-full transition-all duration-500',
                  passwordStrength <= 25 ? 'bg-error-500' : passwordStrength <= 50 ? 'bg-warning-500' : passwordStrength <= 75 ? 'bg-info-500' : 'bg-success-500'
                )}
                style={{ width: `${passwordStrength}%` }}
              ></div>
            </div>
          </div>

          {passwordMessage && (
            <div className={clsx(
              'p-4 rounded-lg text-sm flex items-center gap-3',
              passwordMessage.type === 'success'
                ? 'bg-success-50 text-success-700 border border-success-100'
                : 'bg-error-50 text-error-700 border border-error-100'
            )}>
              {passwordMessage.type === 'success'
                ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                : <XCircle className="w-4 h-4 shrink-0" />
              }
              {passwordMessage.text}
            </div>
          )}

          <div className="pt-2">
            <button type="submit" disabled={savingPassword} className="btn btn-primary w-full sm:w-auto shadow-sm">
              {savingPassword ? <Loader2 className="w-4 h-4 animate-spin" /> : <Key className="w-4 h-4" />}
              <span>تحديث كلمة المرور</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
