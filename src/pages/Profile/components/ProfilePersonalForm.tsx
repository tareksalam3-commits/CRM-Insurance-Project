import { User, Mail, Phone, CreditCard, Save, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import clsx from 'clsx';
import type { UseFormRegister, UseFormHandleSubmit, FieldErrors } from 'react-hook-form';
import type { User as SupabaseUser } from '../../../lib/supabase';
import type { ProfileFormData, StatusMessage } from '../types';

interface ProfilePersonalFormProps {
  user: SupabaseUser | null;
  registerProfile: UseFormRegister<ProfileFormData>;
  handleProfileSubmit: UseFormHandleSubmit<ProfileFormData>;
  profileErrors: FieldErrors<ProfileFormData>;
  onProfileSubmit: (data: ProfileFormData) => void | Promise<void>;
  savingProfile: boolean;
  profileMessage: StatusMessage | null;
}

export function ProfilePersonalForm({
  user,
  registerProfile,
  handleProfileSubmit,
  profileErrors,
  onProfileSubmit,
  savingProfile,
  profileMessage,
}: ProfilePersonalFormProps) {
  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-6">
        <div className="p-2 bg-primary-50 rounded-lg text-primary-600">
          <User className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-base md:text-lg font-bold text-secondary-900">المعلومات الشخصية</h3>
          <p className="text-sm text-secondary-500">قم بتحديث بياناتك الأساسية هنا</p>
        </div>
      </div>

      <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="form-group">
            <label className="input-label">الاسم الكامل</label>
            <div className="relative">
              <input
                {...registerProfile('name')}
                className={clsx('input-field pr-11', profileErrors.name && 'border-error-500')}
              />
              <User className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
            </div>
            {profileErrors.name && (
              <p className="text-sm text-error-600 mt-1">{profileErrors.name.message}</p>
            )}
          </div>

          <div className="form-group">
            <label className="input-label">البريد الإلكتروني (للقراءة فقط)</label>
            <div className="relative">
              <input
                type="email"
                value={user?.email}
                disabled
                className="input-field pr-11 bg-secondary-100 text-secondary-500 cursor-not-allowed"
              />
              <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
            </div>
          </div>

          <div className="form-group">
            <label className="input-label">رقم الهاتف</label>
            <div className="relative">
              <input
                {...registerProfile('phone')}
                dir="ltr"
                className="input-field pr-11 text-right"
                placeholder="01xxxxxxxxx"
              />
              <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
            </div>
          </div>

          <div className="form-group">
            <label className="input-label">رقم القيد بالهيئة</label>
            <div className="relative">
              <input
                {...registerProfile('registration_number')}
                className="input-field pr-11"
                placeholder="أدخل رقم القيد"
              />
              <CreditCard className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
            </div>
          </div>
        </div>

        {profileMessage && (
          <div className={clsx(
            'p-4 rounded-lg text-sm flex items-center gap-3',
            profileMessage.type === 'success'
              ? 'bg-success-50 text-success-700 border border-success-100'
              : 'bg-error-50 text-error-700 border border-error-100'
          )}>
            {profileMessage.type === 'success'
              ? <CheckCircle2 className="w-4 h-4 shrink-0" />
              : <XCircle className="w-4 h-4 shrink-0" />
            }
            {profileMessage.text}
          </div>
        )}

        <div className="pt-2 flex justify-end">
          <button type="submit" disabled={savingProfile} className="btn btn-primary shadow-sm">
            {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            <span>حفظ التغييرات</span>
          </button>
        </div>
      </form>
    </div>
  );
}
