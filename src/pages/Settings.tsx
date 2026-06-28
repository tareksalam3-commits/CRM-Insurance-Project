import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase, Settings as SettingsType } from '../lib/supabase';
import { canViewSettings } from '../lib/supabase';
import {
  Shield,
  Building2,
  Bell,
  Calendar,
  Save,
  Loader2
} from 'lucide-react';
import clsx from 'clsx';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const settingsSchema = z.object({
  company_name: z.string().min(1, 'اسم الشركة مطلوب'),
  company_logo_url: z.string().url('الرابط غير صحيح').optional().or(z.literal('')),
  insurance_year_start: z.string().optional(),
  notification_days_before: z.number().min(1).max(30),
  overdue_months_to_suspend: z.number().min(1).max(6)
});

type SettingsFormData = z.infer<typeof settingsSchema>;

export function Settings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<SettingsType | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const canAccess = user ? canViewSettings(user.role) : false;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<SettingsFormData>({
    resolver: zodResolver(settingsSchema)
  });

  useEffect(() => {
    if (canAccess) {
      loadSettings();
    }
  }, [canAccess]);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data } = await supabase
        .from('settings')
        .select('*')
        .maybeSingle();

      if (data) {
        setSettings(data as SettingsType);
        reset({
          company_name: data.company_name || '',
          company_logo_url: data.company_logo_url || '',
          insurance_year_start: data.insurance_year_start || '',
          notification_days_before: data.notification_days_before || 7,
          overdue_months_to_suspend: data.overdue_months_to_suspend || 2
        });
      }
    } catch (error) {
      console.error('Error loading settings:', error);
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = async (data: SettingsFormData) => {
    if (!settings) return;
    setSaving(true);
    setMessage(null);

    try {
      const { error } = await supabase
        .from('settings')
        .update({
          company_name: data.company_name,
          company_logo_url: data.company_logo_url || null,
          insurance_year_start: data.insurance_year_start || null,
          notification_days_before: data.notification_days_before,
          overdue_months_to_suspend: data.overdue_months_to_suspend,
          updated_at: new Date().toISOString()
        })
        .eq('id', settings.id);

      if (error) throw error;

      await supabase.rpc('log_activity', {
        p_action: 'settings_update',
        p_entity_type: 'settings'
      });

      setMessage({ type: 'success', text: 'تم حفظ الإعدادات بنجاح' });
    } catch (error) {
      console.error('Error saving settings:', error);
      setMessage({ type: 'error', text: 'حدث خطأ أثناء الحفظ' });
    } finally {
      setSaving(false);
    }
  };

  if (!canAccess) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <Shield className="w-16 h-16 text-secondary-300 mb-4" />
        <p className="text-secondary-500">ليس لديك صلاحية للوصول لهذه الصفحة</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-secondary-900">الإعدادات</h2>
          <p className="text-sm text-secondary-500 mt-1">
            إعدادات النظام والتطبيق
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-primary-100 flex items-center justify-center">
                <Building2 className="w-5 h-5 text-primary-600" />
              </div>
              <div>
                <h3 className="font-semibold text-secondary-900">معلومات الشركة</h3>
                <p className="text-sm text-secondary-500">إعدادات هوية الشركة</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="form-group">
                <label className="input-label">اسم الشركة</label>
                <input
                  {...register('company_name')}
                  className={clsx('input-field', errors.company_name && 'border-error-500')}
                />
                {errors.company_name && (
                  <p className="text-sm text-error-600 mt-1">{errors.company_name.message}</p>
                )}
              </div>

              <div className="form-group">
                <label className="input-label">رابط الشعار</label>
                <input
                  {...register('company_logo_url')}
                  className="input-field"
                  placeholder="https://example.com/logo.png"
                  dir="ltr"
                />
              </div>
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-success-100 flex items-center justify-center">
                <Calendar className="w-5 h-5 text-success-600" />
              </div>
              <div>
                <h3 className="font-semibold text-secondary-900">السنة التأمينية</h3>
                <p className="text-sm text-secondary-500">إعدادات السنة التأمينية</p>
              </div>
            </div>

            <div className="form-group max-w-md">
              <label className="input-label">تاريخ بداية السنة التأمينية</label>
              <input
                {...register('insurance_year_start')}
                type="date"
                className="input-field"
              />
            </div>
          </div>

          <div className="card">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg bg-warning-100 flex items-center justify-center">
                <Bell className="w-5 h-5 text-warning-600" />
              </div>
              <div>
                <h3 className="font-semibold text-secondary-900">الإشعارات</h3>
                <p className="text-sm text-secondary-500">إعدادات الإشعارات والتذكير</p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="form-group">
                <label className="input-label">أيام قبل الاستحقاق للإشعار</label>
                <input
                  {...register('notification_days_before', { valueAsNumber: true })}
                  type="number"
                  min="1"
                  max="30"
                  className="input-field"
                />
                <p className="text-xs text-secondary-400 mt-1">
                  عدد الأيام قبل تاريخ الاستحقاق لإرسال الإشعار
                </p>
              </div>

              <div className="form-group">
                <label className="input-label">أشهر التأخير للإيقاف</label>
                <input
                  {...register('overdue_months_to_suspend', { valueAsNumber: true })}
                  type="number"
                  min="1"
                  max="6"
                  className="input-field"
                />
                <p className="text-xs text-secondary-400 mt-1">
                  عدد أشهر التأخير قبل إيقاف الوثيقة تلقائياً
                </p>
              </div>
            </div>
          </div>

          {message && (
            <div
              className={clsx(
                'p-4 rounded-lg',
                message.type === 'success'
                  ? 'bg-success-50 text-success-700'
                  : 'bg-error-50 text-error-700'
              )}
            >
              {message.text}
            </div>
          )}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="btn btn-primary"
            >
              {saving ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>جاري الحفظ...</span>
                </>
              ) : (
                <>
                  <Save className="w-5 h-5" />
                  <span>حفظ الإعدادات</span>
                </>
              )}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
