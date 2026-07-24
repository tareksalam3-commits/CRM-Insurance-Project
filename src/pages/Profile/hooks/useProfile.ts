import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { isPasskeySupported } from '../../../lib/supabase';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { profileSchema, passwordSchema, type ProfileFormData, type PasswordFormData, type StatusMessage, type ProfilePerformanceStats } from '../types';
import {
  fetchProfilePerformanceStats, updateProfile, changePassword, uploadAvatar,
} from '../services/profileService';
import { useReconnectRefetch } from '../../../hooks/useReconnectRefetch';

export function useProfile() {
  const { user, refreshUser, registerPasskey } = useAuth();
  const [activeTab, setActiveTab] = useState<'personal' | 'security' | 'subscription'>('personal');
  const canSeeSubscription = !!user && user.role !== 'agent' && user.role !== 'premium_agent';
  const [registeringPasskey, setRegisteringPasskey] = useState(false);
  const [passkeyMessage, setPasskeyMessage] = useState<StatusMessage | null>(null);
  const passkeySupported = isPasskeySupported();
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);
  const [avatarMessage, setAvatarMessage] = useState<StatusMessage | null>(null);
  const [profileMessage, setProfileMessage] = useState<StatusMessage | null>(null);
  const [passwordMessage, setPasswordMessage] = useState<StatusMessage | null>(null);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [passwordStrength, setPasswordStrength] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [stats, setStats] = useState<ProfilePerformanceStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);
  const [statsError, setStatsError] = useState<string | null>(null);

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

  // جلب مؤشرات الأداء الحقيقية من قاعدة البيانات لحظة فتح الصفحة
  const loadStats = async () => {
    if (!user) return;
    setStatsLoading(true);
    setStatsError(null);
    try {
      const result = await fetchProfilePerformanceStats(user.id, user.role);
      setStats(result);
    } catch (err) {
      console.error('Error fetching profile performance stats:', err);
      setStatsError('تعذر تحميل مؤشرات الأداء، حاول تحديث الصفحة');
    } finally {
      setStatsLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  useReconnectRefetch(loadStats);

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
      setPasskeyMessage({ type: 'error', text: `تعذر تسجيل البصمة: ${error.message || 'خطأ غير معروف'}` });
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
      await updateProfile(user.id, data);
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
      const { error } = await changePassword(user.email, data.currentPassword, data.newPassword);

      if (error) {
        setPasswordMessage({ type: 'error', text: error });
        return;
      }

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
      await uploadAvatar(user.id, file);

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

  const monthlyAchievementRate = stats && user?.target
    ? Math.round((stats.monthTotalPaid / user.target) * 100)
    : null;

  return {
    user,
    activeTab,
    setActiveTab,
    canSeeSubscription,
    registeringPasskey,
    passkeyMessage,
    passkeySupported,
    savingProfile,
    savingPassword,
    uploadingAvatar,
    avatarMessage,
    profileMessage,
    passwordMessage,
    showCurrentPassword,
    setShowCurrentPassword,
    showNewPassword,
    setShowNewPassword,
    passwordStrength,
    fileInputRef,
    stats,
    statsLoading,
    statsError,
    registerProfile,
    handleProfileSubmit,
    profileErrors,
    registerPassword,
    handlePasswordSubmit,
    passwordErrors,
    handleRegisterPasskey,
    onProfileSubmit,
    onPasswordSubmit,
    handleAvatarUpload,
    monthlyAchievementRate,
  };
}
