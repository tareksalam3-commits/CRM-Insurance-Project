import { useState, useEffect } from 'react';
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
  Loader2,
  Camera,
  IdCard,
  Calendar,
  Activity,
  Trophy,
  Briefcase,
  Lock,
  Eye,
  EyeOff,
  Upload
} from 'lucide-react';
import clsx from 'clsx';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { format } from 'date-fns';

const profileSchema = z.object({
  name: z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل'),
  phone: z.string().optional(),
  registration_number: z.string().optional(),
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
  const [activeTab, setActiveTab] = useState<'personal' | 'security'>('personal');
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);

  const {
    register: registerProfile,
    handleSubmit: handleProfileSubmit,
    formState: { errors: profileErrors }
  } = useForm<ProfileFormData>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: user?.name || '',
      phone: user?.phone || '',
      registration_number: (user as any)?.registration_number || ''
    }
  });

  const {
    register: registerPassword,
    handleSubmit: handlePasswordSubmit,
    reset: resetPassword,
    watch: watchPassword,
    formState: { errors: passwordErrors }
  } = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema)
  });

  const newPasswordValue = watchPassword('newPassword');

  useEffect(() => {
    if (!newPasswordValue) {
      setPasswordStrength(0);
      return;
    }
    let strength = 0;
    if (newPasswordValue.length >= 8) strength += 25;
    if (/[A-Z]/.test(newPasswordValue)) strength += 25;
    if (/[0-9]/.test(newPasswordValue)) strength += 25;
    if (/[^A-Za-z0-9]/.test(newPasswordValue)) strength += 25;
    setPasswordStrength(strength);
  }, [newPasswordValue]);

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
          registration_number: data.registration_number,
          updated_at: new Date().toISOString()
        } as any)
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

  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    setUploadingAvatar(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${user.id}-${Math.random()}.${fileExt}`;
      const filePath = `avatars/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('profiles')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('profiles')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: publicUrl } as any)
        .eq('id', user.id);

      if (updateError) throw updateError;

      await refreshUser();
    } catch (error) {
      console.error('Error uploading avatar:', error);
    } finally {
      setUploadingAvatar(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-12 animate-fadeIn" dir="rtl">
      {/* Header Section */}
      <div className="relative mb-32">
        {/* Cover Photo */}
        <div className="h-48 w-full bg-gradient-to-r from-[#10B981] to-[#059669] rounded-b-[32px] relative shadow-lg overflow-hidden">
          <div className="absolute inset-0 opacity-20 bg-[url('https://www.transparenttextures.com/patterns/cubes.png')]"></div>
          <button className="absolute bottom-4 left-6 bg-white/20 hover:bg-white/30 backdrop-blur-md text-white px-4 py-2 rounded-xl flex items-center gap-2 transition-all border border-white/30 text-sm font-medium">
            <Camera className="w-4 h-4" />
            تغيير الغلاف
          </button>
        </div>

        {/* Profile Identity Card */}
        <div className="absolute -bottom-24 right-8 left-8 flex flex-col md:flex-row items-end md:items-center gap-6">
          <div className="relative group">
            <div className="w-32 h-32 md:w-40 md:h-40 rounded-full border-4 border-white shadow-2xl overflow-hidden bg-white">
              {uploadingAvatar ? (
                <div className="w-full h-full flex items-center justify-center bg-secondary-50">
                  <Loader2 className="w-8 h-8 animate-spin text-[#10B981]" />
                </div>
              ) : user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.name}
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#E6F7F1] text-[#10B981] text-5xl font-bold">
                  {user?.name?.charAt(0)}
                </div>
              )}
            </div>
            <label className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer rounded-full">
              <Camera className="w-8 h-8 text-white" />
              <input type="file" className="hidden" accept="image/*" onChange={handleAvatarUpload} />
            </label>
          </div>

          <div className="flex-1 pb-4">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">{user?.name}</h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E6F7F1] text-[#059669] text-xs font-bold border border-[#10B981]/20">
                <Shield className="w-3.5 h-3.5" />
                {ROLE_LABELS[user?.role || 'agent']}
              </span>
            </div>
            <p className="text-slate-500 mt-1 flex items-center gap-2">
              <Mail className="w-4 h-4" />
              {user?.email}
            </p>
          </div>
        </div>
      </div>

      {/* Stats Bar */}
      <div className="px-8 mb-8">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
          <div className="text-center md:border-l border-slate-100 last:border-0">
            <div className="flex justify-center mb-2">
              <div className="p-2 bg-blue-50 rounded-lg text-blue-600">
                <Briefcase className="w-5 h-5" />
              </div>
            </div>
            <p className="text-xs text-slate-400 font-medium">إجمالي العقود</p>
            <p className="text-lg font-bold text-slate-800">124</p>
          </div>
          <div className="text-center md:border-l border-slate-100 last:border-0">
            <div className="flex justify-center mb-2">
              <div className="p-2 bg-emerald-50 rounded-lg text-emerald-600">
                <Calendar className="w-5 h-5" />
              </div>
            </div>
            <p className="text-xs text-slate-400 font-medium">تاريخ الانضمام</p>
            <p className="text-lg font-bold text-slate-800">
              {user?.created_at ? format(new Date(user.created_at), 'MM/yyyy') : '-'}
            </p>
          </div>
          <div className="text-center md:border-l border-slate-100 last:border-0">
            <div className="flex justify-center mb-2">
              <div className="p-2 bg-purple-50 rounded-lg text-purple-600">
                <Activity className="w-5 h-5" />
              </div>
            </div>
            <p className="text-xs text-slate-400 font-medium">آخر نشاط</p>
            <p className="text-lg font-bold text-slate-800">منذ ساعتين</p>
          </div>
          <div className="text-center">
            <div className="flex justify-center mb-2">
              <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                <Trophy className="w-5 h-5" />
              </div>
            </div>
            <p className="text-xs text-slate-400 font-medium">مستوى الأداء</p>
            <p className="text-lg font-bold text-slate-800">94%</p>
          </div>
        </div>
      </div>

      <div className="px-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Navigation Sidebar */}
        <div className="lg:col-span-3">
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-2 overflow-hidden">
            <button
              onClick={() => setActiveTab('personal')}
              className={clsx(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium",
                activeTab === 'personal' ? "bg-[#10B981] text-white shadow-md shadow-[#10B981]/20" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <User className="w-5 h-5" />
              المعلومات الشخصية
            </button>
            <button
              onClick={() => setActiveTab('security')}
              className={clsx(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium mt-1",
                activeTab === 'security' ? "bg-[#10B981] text-white shadow-md shadow-[#10B981]/20" : "text-slate-600 hover:bg-slate-50"
              )}
            >
              <Lock className="w-5 h-5" />
              الأمان وكلمة المرور
            </button>
          </div>
        </div>

        {/* Content Area */}
        <div className="lg:col-span-9">
          {activeTab === 'personal' ? (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-2 bg-[#E6F7F1] rounded-lg text-[#10B981]">
                  <User className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">المعلومات الشخصية</h3>
                  <p className="text-sm text-slate-400">قم بتحديث بياناتك الأساسية هنا</p>
                </div>
              </div>

              <form onSubmit={handleProfileSubmit(onProfileSubmit)} className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">الاسم الكامل</label>
                    <div className="relative group">
                      <input
                        {...registerProfile('name')}
                        className={clsx(
                          'w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pr-11 pl-4 text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#10B981]/20 focus:border-[#10B981] transition-all outline-none',
                          profileErrors.name && 'border-red-400 bg-red-50'
                        )}
                      />
                      <User className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-[#10B981] transition-colors" />
                    </div>
                    {profileErrors.name && <p className="text-xs text-red-500 mr-1">{profileErrors.name.message}</p>}
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">البريد الإلكتروني (للقراءة فقط)</label>
                    <div className="relative">
                      <input
                        type="email"
                        value={user?.email}
                        disabled
                        className="w-full bg-slate-100 border border-slate-200 rounded-xl py-3 pr-11 pl-4 text-slate-500 cursor-not-allowed outline-none"
                      />
                      <Mail className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">رقم الهاتف</label>
                    <div className="relative group">
                      <input
                        {...registerProfile('phone')}
                        dir="ltr"
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pr-11 pl-4 text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#10B981]/20 focus:border-[#10B981] transition-all outline-none text-right"
                        placeholder="01xxxxxxxxx"
                      />
                      <Phone className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-[#10B981] transition-colors" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">رقم القيد بالهيئة</label>
                    <div className="relative group">
                      <input
                        {...registerProfile('registration_number')}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pr-11 pl-4 text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#10B981]/20 focus:border-[#10B981] transition-all outline-none"
                        placeholder="أدخل رقم القيد"
                      />
                      <IdCard className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-[#10B981] transition-colors" />
                    </div>
                  </div>
                </div>

                {profileMessage && (
                  <div className={clsx(
                    'p-4 rounded-xl text-sm flex items-center gap-3',
                    profileMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'
                  )}>
                    <div className={clsx('w-2 h-2 rounded-full', profileMessage.type === 'success' ? 'bg-emerald-500' : 'bg-red-500')}></div>
                    {profileMessage.text}
                  </div>
                )}

                <div className="pt-4 flex justify-end">
                  <button
                    type="submit"
                    disabled={savingProfile}
                    className="bg-[#10B981] hover:bg-[#059669] text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-[#10B981]/20 disabled:opacity-70"
                  >
                    {savingProfile ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                    حفظ التغييرات
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
              <div className="flex items-center gap-3 mb-8">
                <div className="p-2 bg-[#E6F7F1] rounded-lg text-[#10B981]">
                  <Lock className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">الأمان وكلمة المرور</h3>
                  <p className="text-sm text-slate-400">حافظ على أمان حسابك بتحديث كلمة المرور</p>
                </div>
              </div>

              <form onSubmit={handlePasswordSubmit(onPasswordSubmit)} className="space-y-6 max-w-2xl">
                <div className="space-y-2">
                  <label className="text-sm font-semibold text-slate-700">كلمة المرور الحالية</label>
                  <div className="relative">
                    <input
                      {...registerPassword('currentPassword')}
                      type={showCurrentPassword ? 'text' : 'password'}
                      className={clsx(
                        'w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pr-11 pl-12 text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#10B981]/20 focus:border-[#10B981] transition-all outline-none',
                        passwordErrors.currentPassword && 'border-red-400'
                      )}
                    />
                    <Key className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                      className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                    >
                      {showCurrentPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                    </button>
                  </div>
                  {passwordErrors.currentPassword && <p className="text-xs text-red-500 mr-1">{passwordErrors.currentPassword.message}</p>}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">كلمة المرور الجديدة</label>
                    <div className="relative">
                      <input
                        {...registerPassword('newPassword')}
                        type={showNewPassword ? 'text' : 'password'}
                        className={clsx(
                          'w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pr-11 pl-12 text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#10B981]/20 focus:border-[#10B981] transition-all outline-none',
                          passwordErrors.newPassword && 'border-red-400'
                        )}
                      />
                      <Key className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                      <button
                        type="button"
                        onClick={() => setShowNewPassword(!showNewPassword)}
                        className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        {showNewPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-semibold text-slate-700">تأكيد كلمة المرور</label>
                    <div className="relative">
                      <input
                        {...registerPassword('confirmPassword')}
                        type="password"
                        className={clsx(
                          'w-full bg-slate-50 border border-slate-200 rounded-xl py-3 pr-11 pl-4 text-slate-800 focus:bg-white focus:ring-2 focus:ring-[#10B981]/20 focus:border-[#10B981] transition-all outline-none',
                          passwordErrors.confirmPassword && 'border-red-400'
                        )}
                      />
                      <Key className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    </div>
                  </div>
                </div>

                {/* Password Strength Indicator */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-xs font-medium text-slate-500">قوة كلمة المرور</span>
                    <span className={clsx(
                      "text-xs font-bold",
                      passwordStrength <= 25 ? "text-red-500" : passwordStrength <= 50 ? "text-amber-500" : passwordStrength <= 75 ? "text-blue-500" : "text-emerald-500"
                    )}>
                      {passwordStrength <= 25 ? "ضعيفة" : passwordStrength <= 50 ? "متوسطة" : passwordStrength <= 75 ? "جيدة" : "قوية جداً"}
                    </span>
                  </div>
                  <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className={clsx(
                        "h-full transition-all duration-500",
                        passwordStrength <= 25 ? "bg-red-500" : passwordStrength <= 50 ? "bg-amber-500" : passwordStrength <= 75 ? "bg-blue-500" : "bg-emerald-500"
                      )}
                      style={{ width: `${passwordStrength}%` }}
                    ></div>
                  </div>
                </div>

                {passwordMessage && (
                  <div className={clsx(
                    'p-4 rounded-xl text-sm flex items-center gap-3',
                    passwordMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'
                  )}>
                    <div className={clsx('w-2 h-2 rounded-full', passwordMessage.type === 'success' ? 'bg-emerald-500' : 'bg-red-500')}></div>
                    {passwordMessage.text}
                  </div>
                )}

                <div className="pt-4">
                  <button
                    type="submit"
                    disabled={savingPassword}
                    className="w-full sm:w-auto bg-[#10B981] hover:bg-[#059669] text-white px-8 py-3 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg shadow-[#10B981]/20 disabled:opacity-70"
                  >
                    {savingPassword ? <Loader2 className="w-5 h-5 animate-spin" /> : <Key className="w-5 h-5" />}
                    تحديث كلمة المرور
                  </button>
                </div>
              </form>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
