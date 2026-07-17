import { useState } from 'react';
import { X, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { updateSubscriptionSettings } from '../services/adminService';
import type { SubscriptionSettings } from '../types';

// تعديل إعدادات الاشتراكات العامة من لوحة الإدارة — بيانات الدفع
// (Instapay / Vodafone Cash)، تفعيل النظام، والفترة التجريبية
export function SubscriptionSettingsModal({
  settings, onClose, onDone,
}: {
  settings: SubscriptionSettings;
  onClose: () => void;
  onDone: () => void;
}) {
  const [subscriptionsEnabled, setSubscriptionsEnabled] = useState(settings.subscriptions_enabled);
  const [trialEnabled, setTrialEnabled] = useState(settings.trial_enabled);
  const [trialMonths, setTrialMonths] = useState(String(settings.trial_months ?? 6));
  const [gracePeriodDays, setGracePeriodDays] = useState(String(settings.grace_period_days ?? 0));

  const [instapayEnabled, setInstapayEnabled] = useState(settings.instapay_enabled);
  const [instapayName, setInstapayName] = useState(settings.instapay_name || '');
  const [instapayNumber, setInstapayNumber] = useState(settings.instapay_number || '');

  const [vodafoneEnabled, setVodafoneEnabled] = useState(settings.vodafone_cash_enabled);
  const [vodafoneName, setVodafoneName] = useState(settings.vodafone_cash_name || '');
  const [vodafoneNumber, setVodafoneNumber] = useState(settings.vodafone_cash_number || '');

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setError(null);

    if (instapayEnabled && (!instapayName.trim() || !instapayNumber.trim())) {
      setError('أدخل اسم صاحب الحساب ورقم التحويل الخاص بـ Instapay، أو أوقفها');
      return;
    }
    if (vodafoneEnabled && (!vodafoneName.trim() || !vodafoneNumber.trim())) {
      setError('أدخل اسم صاحب الحساب ورقم المحفظة الخاص بـ Vodafone Cash، أو أوقفها');
      return;
    }

    setSaving(true);
    try {
      await updateSubscriptionSettings(settings.id, {
        subscriptions_enabled: subscriptionsEnabled,
        trial_enabled: trialEnabled,
        trial_months: Number(trialMonths) || 0,
        grace_period_days: Number(gracePeriodDays) || 0,
        instapay_enabled: instapayEnabled,
        instapay_name: instapayName.trim() || null,
        instapay_number: instapayNumber.trim() || null,
        vodafone_cash_enabled: vodafoneEnabled,
        vodafone_cash_name: vodafoneName.trim() || null,
        vodafone_cash_number: vodafoneNumber.trim() || null,
      });
      onDone();
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء حفظ الإعدادات');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-lg max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-secondary-100 px-5 py-4 flex items-center justify-between">
          <h3 className="font-bold text-secondary-900">إعدادات الاشتراكات وبيانات الدفع</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary-100">
            <X className="w-5 h-5 text-secondary-500" />
          </button>
        </div>

        <div className="p-5 space-y-6">
          {/* إعدادات عامة */}
          <div className="space-y-3">
            <p className="text-sm font-semibold text-secondary-700">إعدادات عامة</p>
            <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-secondary-200 cursor-pointer">
              <span className="text-sm text-secondary-700">تفعيل نظام الاشتراكات</span>
              <input type="checkbox" checked={subscriptionsEnabled} onChange={(e) => setSubscriptionsEnabled(e.target.checked)} className="w-4 h-4 accent-primary-600" />
            </label>
            <label className="flex items-center justify-between gap-3 p-3 rounded-xl border border-secondary-200 cursor-pointer">
              <span className="text-sm text-secondary-700">تفعيل الفترة التجريبية للمستخدمين الجدد</span>
              <input type="checkbox" checked={trialEnabled} onChange={(e) => setTrialEnabled(e.target.checked)} className="w-4 h-4 accent-primary-600" />
            </label>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-semibold text-secondary-600 block mb-1.5">مدة التجربة (بالشهور)</label>
                <input type="number" min={0} value={trialMonths} onChange={(e) => setTrialMonths(e.target.value)} className="input-field" />
              </div>
              <div>
                <label className="text-xs font-semibold text-secondary-600 block mb-1.5">فترة سماح بعد الانتهاء (بالأيام)</label>
                <input type="number" min={0} value={gracePeriodDays} onChange={(e) => setGracePeriodDays(e.target.value)} className="input-field" />
              </div>
            </div>
          </div>

          {/* Instapay */}
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-secondary-700">Instapay</span>
              <input type="checkbox" checked={instapayEnabled} onChange={(e) => setInstapayEnabled(e.target.checked)} className="w-4 h-4 accent-primary-600" />
            </label>
            {instapayEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-secondary-600 block mb-1.5">اسم صاحب الحساب</label>
                  <input type="text" value={instapayName} onChange={(e) => setInstapayName(e.target.value)} placeholder="مثال: أحمد محمد" className="input-field" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-secondary-600 block mb-1.5">رقم التحويل / الـ Handle</label>
                  <input type="text" value={instapayNumber} onChange={(e) => setInstapayNumber(e.target.value)} dir="ltr" placeholder="01xxxxxxxxx" className="input-field" />
                </div>
              </div>
            )}
          </div>

          {/* Vodafone Cash */}
          <div className="space-y-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm font-semibold text-secondary-700">Vodafone Cash</span>
              <input type="checkbox" checked={vodafoneEnabled} onChange={(e) => setVodafoneEnabled(e.target.checked)} className="w-4 h-4 accent-primary-600" />
            </label>
            {vodafoneEnabled && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-secondary-600 block mb-1.5">اسم صاحب المحفظة</label>
                  <input type="text" value={vodafoneName} onChange={(e) => setVodafoneName(e.target.value)} placeholder="مثال: أحمد محمد" className="input-field" />
                </div>
                <div>
                  <label className="text-xs font-semibold text-secondary-600 block mb-1.5">رقم المحفظة</label>
                  <input type="text" value={vodafoneNumber} onChange={(e) => setVodafoneNumber(e.target.value)} dir="ltr" placeholder="01xxxxxxxxx" className="input-field" />
                </div>
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 p-3 rounded-xl bg-error-50 text-error-700 text-sm">
              <XCircle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <button
            onClick={handleSave}
            disabled={saving}
            className="btn btn-primary w-full justify-center"
          >
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
            حفظ الإعدادات
          </button>
        </div>
      </div>
    </div>
  );
}
