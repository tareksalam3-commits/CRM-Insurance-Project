import { useState } from 'react';
import { X, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { manualUpdateSubscription, type AdminSubscriptionRow } from '../services/adminService';
import type { SubscriptionDuration, SubscriptionStatus } from '../types';

const STATUS_OPTIONS: { value: SubscriptionStatus; label: string }[] = [
  { value: 'trial',           label: 'تجربة مجانية' },
  { value: 'active',          label: 'نشط' },
  { value: 'expired',         label: 'منتهي' },
  { value: 'pending_payment', label: 'بانتظار الاشتراك' },
  { value: 'suspended',       label: 'موقوف' }
];

const toDateInput = (d: string | null) => (d ? d.slice(0, 10) : '');

export function ManualSubscriptionModal({
  row, durations, onClose, onDone,
}: {
  row: AdminSubscriptionRow;
  durations: SubscriptionDuration[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [status, setStatus] = useState<SubscriptionStatus>(row.status);
  const [durationId, setDurationId] = useState(row.duration_id || '');
  const [periodStart, setPeriodStart] = useState(toDateInput(row.current_period_start));
  const [periodEnd, setPeriodEnd] = useState(toDateInput(row.current_period_end));
  const [trialEnd, setTrialEnd] = useState(toDateInput(row.trial_end_date));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      await manualUpdateSubscription(row.user_id, {
        status,
        duration_id: durationId || null,
        current_period_start: periodStart || null,
        current_period_end: periodEnd || null,
        trial_end_date: trialEnd || null
      });
      onDone();
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const grantFreeYear = () => {
    setStatus('active');
    const end = new Date();
    end.setFullYear(end.getFullYear() + 1);
    setPeriodStart(new Date().toISOString().slice(0, 10));
    setPeriodEnd(end.toISOString().slice(0, 10));
  };

  const resetTrial = () => {
    setStatus('trial');
    const end = new Date();
    end.setMonth(end.getMonth() + 6);
    setTrialEnd(end.toISOString().slice(0, 10));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-secondary-100 px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-secondary-900">تحكم يدوي بالاشتراك</h3>
            <p className="text-xs text-secondary-500">{row.users?.name}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary-100">
            <X className="w-5 h-5 text-secondary-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="flex gap-2">
            <button onClick={grantFreeYear} className="btn btn-secondary flex-1 justify-center text-xs">منح سنة مجانية</button>
            <button onClick={resetTrial} className="btn btn-secondary flex-1 justify-center text-xs">إعادة فترة تجريبية</button>
          </div>

          <div>
            <label className="text-sm font-semibold text-secondary-700 block mb-2">حالة الاشتراك</label>
            <select value={status} onChange={(e) => setStatus(e.target.value as SubscriptionStatus)} className="input-field">
              {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="text-sm font-semibold text-secondary-700 block mb-2">مدة الاشتراك</label>
            <select value={durationId} onChange={(e) => setDurationId(e.target.value)} className="input-field">
              <option value="">- بدون -</option>
              {durations.map((d) => <option key={d.id} value={d.id}>{d.label}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-semibold text-secondary-700 block mb-2">بداية الاشتراك</label>
              <input type="date" value={periodStart} onChange={(e) => setPeriodStart(e.target.value)} className="input-field" />
            </div>
            <div>
              <label className="text-sm font-semibold text-secondary-700 block mb-2">نهاية الاشتراك</label>
              <input type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} className="input-field" />
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-secondary-700 block mb-2">نهاية الفترة التجريبية</label>
            <input type="date" value={trialEnd} onChange={(e) => setTrialEnd(e.target.value)} className="input-field" />
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
            حفظ التغييرات
          </button>
        </div>
      </div>
    </div>
  );
}
