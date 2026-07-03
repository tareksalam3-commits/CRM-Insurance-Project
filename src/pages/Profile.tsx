import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase, isPasskeySupported } from '../lib/supabase';
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
  CreditCard,
  Calendar,
  Activity,
  Trophy,
  Briefcase,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  XCircle,
  Fingerprint
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
  const { user, refreshUser, registerPasskey } = useAuth();
  const [activeTab, setActiveTab] = useState<'personal' | 'security'>('personal');
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [passkeyMessage, setPasskeyMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const passkeySupported = isPasskeySupported();
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [userRank, setUserRank] = useState<number | null>(null);
  const [totalSameRole, setTotalSameRole] = useState<number | null>(null);
  const [paidThisMonth, setPaidThisMonth] = useState<number | null>(null);

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

  // Fetch user rank among same role and paid installments this month
  useEffect(() => {
    if (!user) return;

    const fetchStats = async () => {
      try {
        // 1. Get all users with the same role and their policy counts
        const { data: sameRoleUsers, error: usersError } = await supabase
          .from('users')
          .select('id')
          .eq('role', user.role)
          .eq('is_active', true);

        if (!usersError && sameRoleUsers) {
          const userIds = sameRoleUsers.map((u: { id: string }) => u.id);

          // Get policy counts for each user with same role
          const { data: policyCounts, error: policiesError } = await supabase
            .from('policies')
            .select('owner_id')
            .in('owner_id', userIds);

          if (!policiesError && policyCounts) {
            // Count policies per user
            const countMap: Record<string, number> = {};
            for (const p of policyCounts) {
              countMap[p.owner_id] = (countMap[p.owner_id] || 0) + 1;
            }

            const myCount = countMap[user.id] || 0;
            // Rank = number of users with more policies than me + 1
            const rank = Object.values(countMap).filter((c) => c > myCount).length + 1;
            setUserRank(rank);
            setTotalSameRole(userIds.length);
          }
        }

        // 2. Get paid (non-cancelled) payments this month
        const now = new Date();
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
        const monthEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0];

        const { data: payments, error: paymentsError } = await supabase
          .from('payments')
          .select('id, installment_id, is_cancelled, installments!inner(policy_id, policies!inner(owner_id))')
          .eq('is_cancelled', false)
          .gte('payment_month', monthStart)
          .lte('payment_month', monthEnd);

        if (!paymentsError && payments) {
          // Filter only payments for this user's policies
          const myPayments = payments.filter((pay: any) => {
            return pay.installments?.policies?.owner_id === user.id;
          });
          setPaidThisMonth(myPayments.length);
        }
      } catch (err) {
        console.error('Error fetching profile stats:', err);
      }
    };

    fetchStats();
  }, [user]);

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

  const handleRegisterPasskey = async () => {
    setRegisteringPasskey(true);
    setPasskeyMessage(null);

    const { error } = await registerPasskey();

    if (error) {
      setPasskeyMessage({ type: 'error', text: 'تعذر تسجيل البصمة، حاول مرة أخرى' });
    } else {
      setPasskeyMessage({ type: 'success', text: 'تم تسجيل البصمة بنجاح، يمكنك الآن الدخول بها' });
    }
    setRegisteringPasskey(false);
  };

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

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setAvatarMessage({ type: 'error', text: 'يرجى اختيار ملف صورة صالح' });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      setAvatarMessage({ type: 'error', text: 'حجم الصورة يجب أن يكون أقل من 5 ميجابايت' });
      return;
    }

    setUploadingAvatar(true);
    setAvatarMessage(null);

    try {
      const fileExt = file.name.split('.').pop();
      // Use fixed filename per user to overwrite old avatar
      const filePath = `avatars/${user.id}.${fileExt}`;

      // Upload with upsert to overwrite existing file
      const { error: uploadError } = await supabase.storage
        .from('profiles')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('profiles')
        .getPublicUrl(filePath);

      // Add cache-busting to force image refresh
      const urlWithTimestamp = `${publicUrl}?t=${Date.now()}`;

      const { error: updateError } = await supabase
        .from('users')
        .update({ avatar_url: urlWithTimestamp } as any)
        .eq('id', user.id);

      if (updateError) throw updateError;

      await refreshUser();
      setAvatarMessage({ type: 'success', text: 'تم تحديث الصورة بنجاح' });

      // Reset file input
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (error: any) {
      console.error('Error uploading avatar:', error);
      const msg = error?.message?.includes('Bucket not found')
        ? 'خطأ في الإعداد: تأكد من إنشاء bucket باسم profiles في Supabase Storage'
        : 'حدث خطأ أثناء رفع الصورة، حاول مرة أخرى';
      setAvatarMessage({ type: 'error', text: msg });
    } finally {
      setUploadingAvatar(false);
    }
  };


  const formatLastLogin = (dateStr: string): string => {
    const diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (diff < 60) return 'الآن';
    if (diff < 3600) return `منذ ${Math.floor(diff / 60)} د`;
    if (diff < 86400) return `منذ ${Math.floor(diff / 3600)} س`;
    if (diff < 2592000) return `منذ ${Math.floor(diff / 86400)} يوم`;
    return format(new Date(dateStr), 'MM/yyyy');
  };

  return (
    <div className="min-h-screen bg-[#F8FAFC] pb-12 animate-fadeIn" dir="rtl">

      {/* Profile Header — no cover photo */}
      <div className="bg-white border-b border-slate-100 px-8 py-8 mb-8 shadow-sm">
        <div className="flex flex-col md:flex-row items-center md:items-start gap-6">

          {/* Avatar + Upload Button */}
          <div className="flex flex-col items-center gap-3">
            <div className="w-28 h-28 rounded-full border-4 border-white shadow-xl overflow-hidden bg-white ring-2 ring-[#10B981]/30">
              {uploadingAvatar ? (
                <div className="w-full h-full flex items-center justify-center bg-[#E6F7F1]">
                  <Loader2 className="w-8 h-8 animate-spin text-[#10B981]" />
                </div>
              ) : user?.avatar_url ? (
                <img
                  src={user.avatar_url}
                  alt={user.name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center bg-[#E6F7F1] text-[#10B981] text-4xl font-bold">
                  {user?.name?.charAt(0)}
                </div>
              )}
            </div>

            {/* Explicit Upload Button */}
            <label className={clsx(
              "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold cursor-pointer transition-all border",
              uploadingAvatar
                ? "bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed"
                : "bg-white text-[#10B981] border-[#10B981]/40 hover:bg-[#E6F7F1] hover:border-[#10B981]"
            )}>
              {uploadingAvatar ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Camera className="w-4 h-4" />
              )}
              {uploadingAvatar ? 'جارٍ الرفع...' : 'تغيير الصورة'}
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                accept="image/*"
                disabled={uploadingAvatar}
                onChange={handleAvatarUpload}
              />
            </label>

            {/* Avatar feedback message */}
            {avatarMessage && (
              <div className={clsx(
                'flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg',
                avatarMessage.type === 'success'
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-red-50 text-red-600'
              )}>
                {avatarMessage.type === 'success'
                  ? <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                  : <XCircle className="w-3.5 h-3.5 shrink-0" />
                }
                {avatarMessage.text}
              </div>
            )}
          </div>

          {/* User Info */}
          <div className="flex-1 text-center md:text-right">
            <div className="flex flex-wrap items-center justify-center md:justify-start gap-3 mb-1">
              <h1 className="text-2xl md:text-3xl font-bold text-slate-900">{user?.name}</h1>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#E6F7F1] text-[#059669] text-xs font-bold border border-[#10B981]/20">
                <Shield className="w-3.5 h-3.5" />
                {ROLE_LABELS[user?.role || 'agent']}
              </span>
            </div>
            <p className="text-slate-500 flex items-center justify-center md:justify-start gap-2 text-sm">
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
                <Trophy className="w-5 h-5" />
              </div>
            </div>
            <p className="text-xs text-slate-400 font-medium">ترتيبك بين الزملاء</p>
            <p className="text-lg font-bold text-slate-800">
              {userRank !== null && totalSameRole !== null
                ? `${userRank} / ${totalSameRole}`
                : '-'}
            </p>
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
            <p className="text-lg font-bold text-slate-800">
              {user?.last_login ? formatLastLogin(user.last_login) : '-'}
            </p>
          </div>
          <div className="text-center">
            <div className="flex justify-center mb-2">
              <div className="p-2 bg-amber-50 rounded-lg text-amber-600">
                <Briefcase className="w-5 h-5" />
              </div>
            </div>
            <p className="text-xs text-slate-400 font-medium">مسددات الشهر</p>
            <p className="text-lg font-bold text-slate-800">
              {paidThisMonth !== null ? paidThisMonth : '-'}
            </p>
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
                      <CreditCard className="absolute right-4 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400 group-focus-within:text-[#10B981] transition-colors" />
                    </div>
                  </div>
                </div>

                {profileMessage && (
                  <div className={clsx(
                    'p-4 rounded-xl text-sm flex items-center gap-3',
                    profileMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'
                  )}>
                    {profileMessage.type === 'success'
                      ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                      : <XCircle className="w-4 h-4 shrink-0" />
                    }
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
            <div className="space-y-6">
            {passkeySupported && (
              <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-[#E6F7F1] rounded-lg text-[#10B981]">
                    <Fingerprint className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-800">الدخول بالبصمة</h3>
                    <p className="text-sm text-slate-400">سجّل بصمة جهازك للدخول بدون كتابة كلمة المرور في كل مرة</p>
                  </div>
                </div>

                {passkeyMessage && (
                  <div className={clsx(
                    'p-4 rounded-xl text-sm flex items-center gap-3 mb-4',
                    passkeyMessage.type === 'success' ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-red-50 text-red-700 border border-red-100'
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
                  onClick={handleRegisterPasskey}
                  disabled={registeringPasskey}
                  className="bg-[#10B981] hover:bg-[#059669] text-white px-8 py-3 rounded-xl font-bold flex items-center gap-2 transition-all shadow-lg shadow-[#10B981]/20 disabled:opacity-70"
                >
                  {registeringPasskey ? <Loader2 className="w-5 h-5 animate-spin" /> : <Fingerprint className="w-5 h-5" />}
                  تسجيل بصمة هذا الجهاز
                </button>
              </div>
            )}

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
                    {passwordErrors.newPassword && <p className="text-xs text-red-500 mr-1">{passwordErrors.newPassword.message}</p>}
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
                    {passwordErrors.confirmPassword && <p className="text-xs text-red-500 mr-1">{passwordErrors.confirmPassword.message}</p>}
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
                    {passwordMessage.type === 'success'
                      ? <CheckCircle2 className="w-4 h-4 shrink-0" />
                      : <XCircle className="w-4 h-4 shrink-0" />
                    }
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
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
