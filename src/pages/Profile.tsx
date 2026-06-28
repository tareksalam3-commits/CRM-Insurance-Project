import { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import { ROLE_LABELS } from '../lib/supabase';
import {
  User,
  Mail,
  Phone,
  Shield,
  Key,
  Save,
  Loader2
} from 'lucide-react';
import clsx from 'clsx';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';

const profileSchema = z.object({
  name: z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل'),
  phone: z.string().optional()
});

const passwordSchema = z.object({
  currentPassword: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
  newPassword: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
  confirmPassword: z.string()
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'كلمات المرور غير متطابقة',
  path: ['confirmPassword']
});

type ProfileFormData = z.infer<typeof profileSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

export function Profile() {
  const { user, refreshUser } = useAuth();
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    formState: { errors: profileErrors }
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || '',
      phone: user?.phone || ''
    }
  });

  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    reset: resetPassword,
    formState: { errors: passwordErrors }
  } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema)
  });

  const onProfileSubmit = async (data: ProfileFormData) => {
    if (!user) return;
    setSavingProfile(true);
    setProfileMessage(null);

    try {
      const { error } = await supabase
        .from('users')
        .update({
          name: data.name,
          phone: data.phone,
          updated_at: new Date().toISOString()
        })
        .eq('id', user.id);

      if (error) throw error;

      await refreshUser();
      setProfileMessage({ type: 'success', text: 'تم حفظ البيانات بنجاح' });
    } catch (error) {
      console.error('Error updating profile:', error);
      setProfileMessage({ type: 'error', text: 'حدث خطأ أثناء الحفظ' });
    } finally {
      setSavingProfile(false);
    }
  };

  const onPasswordSubmit = async (data: PasswordFormData) => {
    if (!user) return;
    setSavingPassword(true);
    setPasswordMessage(null);

    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: user.email,
        password: data.currentPassword
      });

      if (signInError) {
        setPasswordMessage({ type: 'error', text: 'كلمة المرور الحالية غير صحيحة' });
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: data.newPassword
      });

      if (error) throw error;

      resetPassword();
      setPasswordMessage({ type: 'success', text: 'تم تغيير كلمة المرور بنجاح' });
    } catch (error) {
      console.error('Error changing password:', error);
      setPasswordMessage({ type: 'error', text: 'حدث خطأ أثناء تغيير كلمة المرور' });
    } finally {
      setSavingPassword(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-secondary-900">الملف الشخصي</h2>
          <p className="text-sm text-secondary-500 mt-1">
            إدارة بياناتك الشخصية
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="card text-center p-8">
          <div className="w-24 h-24 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-4">
            {user?.avatar_url ? (
              <img
                src={user.avatar_url}
                alt={user.name}
                className="w-24 h-24 rounded-full object-cover"
              />
            ) : (
              <span className="text-4xl text-primary-700 font-bold">
                {user?.name?.charAt(0)}
              </span>
            )}
          </div>
          <h3 className="text-lg font-semibold text-secondary-900">{user?.name}</h3>
          <p className="text-sm text-secondary-500 mt-1">{user?.email}</p>
          <span className="inline-flex items-center gap-1 mt-3 px-3 py-1 rounded-full bg-primary-100 text-primary-700 text-sm font-medium">
            <Shield className="w-4 h-4" />
            {ROLE_LABELS[user?.role || 'agent']}
          </span>

          <div className="mt-6 pt-6 border-t border-secondary-200 space-y-3 text-right">
            <div className="flex items-center justify-between">
              <span className="text-sm text-secondary-500">تاريخ الإنشاء</span>
              <span className="text-sm text-secondary-900">
                {user?.created_at ? format(new Date(user.created_at), 'dd/MM/yyyy') : '-'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-secondary-500">آخر تسجيل دخول</span>
              <span className="text-sm text-secondary-900">
                {user?.last_login ? format(new Date(user.last_login), 'dd/MM/yyyy HH:mm') : '-'}
              </span>
            </div>
          </div>
        </div>

        <div className="lg:col-span-2 space-y-6">
          <div className="card">
            <h3 className="font-semibold text-secondary-900 mb-6">المعلومات الشخصية</h3>

            <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="space-y-4">
              <div className="form-group">
                <label className="input-label">الاسم</label>
                <div className="relative">
                  <input
                    {...registerProfile('name')}
                    className={clsx('input-field', profileErrors.name && 'border-error-500')}
                  />
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                </div>
                {profileErrors.name && (
                  <p className="text-sm text-error-600 mt-1">{profileErrors.name.message}</p>
                )}
              </div>

              <div className="form-group">
                <label className="input-label">البريد الإلكتروني</label>
                <div className="relative">
                  <input
                    type="email"
                    value={user?.email}
                    disabled
                    className="input-field bg-secondary-50"
                  />
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                </div>
                <p className="text-xs text-secondary-400 mt-1">لا يمكن تغيير البريد الإلكتروني</p>
              </div>

              <div className="form-group">
                <label className="input-label">رقم الهاتف</label>
                <div className="relative">
                  <input
                    {...registerProfile('phone')}
                    className="input-field"
                    placeholder="01xxxxxxxxx"
                    dir="ltr"
                  />
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                </div>
              </div>

              {profileMessage && (
                <div
                  className={clsx(
                    'p-3 rounded-lg text-sm',
                    profileMessage.type === 'success'
                      ? 'bg-success-50 text-success-700'
                      : 'bg-error-50 text-error-700'
                  )}
                >
                  {profileMessage.text}
                </div>
              )}

              <button
                type="submit"
                disabled={savingProfile}
                className="btn btn-primary"
              >
                {savingProfile ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>جاري الحفظ...</span>
                  </>
                ) : (
                  <>
                    <Save className="w-5 h-5" />
                    <span>حفظ التغييرات</span>
                  </>
                )}
              </button>
            </form>
          </div>

          <div className="card">
            <h3 className="font-semibold text-secondary-900 mb-6">تغيير كلمة المرور</h3>

            <form onSubmit={handlePasswordSubmit(onPasswordSubmit)} className="space-y-4">
              <div className="form-group">
                <label className="input-label">كلمة المرور الحالية</label>
                <div className="relative">
                  <input
                    {...registerPassword('currentPassword')}
                    type="password"
                    className={clsx('input-field', passwordErrors.currentPassword && 'border-error-500')}
                  />
                  <Key className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                </div>
                {passwordErrors.currentPassword && (
                  <p className="text-sm text-error-600 mt-1">{passwordErrors.currentPassword.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="input-label">كلمة المرور الجديدة</label>
                  <input
                    {...registerPassword('newPassword')}
                    type="password"
                    className={clsx('input-field', passwordErrors.newPassword && 'border-error-500')}
                  />
                  {passwordErrors.newPassword && (
                    <p className="text-sm text-error-600 mt-1">{passwordErrors.newPassword.message}</p>
                  )}
                </div>

                <div className="form-group">
                  <label className="input-label">تأكيد كلمة المرور</label>
                  <input
                    {...registerPassword('confirmPassword')}
                    type="password"
                    className={clsx('input-field', passwordErrors.confirmPassword && 'border-error-500')}
                  />
                  {passwordErrors.confirmPassword && (
                    <p className="text-sm text-error-600 mt-1">{passwordErrors.confirmPassword.message}</p>
                  )}
                </div>
              </div>

              {passwordMessage && (
                <div
                  className={clsx(
                    'p-3 rounded-lg text-sm',
                    passwordMessage.type === 'success'
                      ? 'bg-success-50 text-success-700'
                      : 'bg-error-50 text-error-700'
                  )}
                >
                  {passwordMessage.text}
                </div>
              )}

              <button
                type="submit"
                disabled={savingPassword}
                className="btn btn-primary"
              >
                {savingPassword ? (
                  <>
                    <Loader2 className="w-5 h-5 animate-spin" />
                    <span>جاري التغيير...</span>
                  </>
                ) : (
                  <>
                    <Key className="w-5 h-5" />
                    <span>تغيير كلمة المرور</span>
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
