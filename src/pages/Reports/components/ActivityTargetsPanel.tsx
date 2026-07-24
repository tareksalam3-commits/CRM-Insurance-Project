import { useState, useEffect } from 'react';
import { Settings2, Check } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { fetchActivityTargets, updateActivityTargets } from '../services/activityTargetsService';
import type { ActivityTargets } from '../business/performanceScoreCalculator';

// إعدادات الأهداف اليومية المستخدمة فى حساب "التقييم الشامل" (30% من الدرجة
// النهائية) — متاحة فقط لـ super_admin / development_manager (نفس تقييد
// RLS على performance_activity_targets)، وباقي المستويات الإشرافية ميشوفوش
// الزرار ده أصلاً حتى لو دخلوا الصفحة
export function ActivityTargetsPanel({
  targets,
  onSaved,
}: {
  targets: (ActivityTargets & { id: string | null }) | null;
  onSaved: (t: ActivityTargets & { id: string | null }) => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [form, setForm] = useState({ calls: '', appointments: '', newClients: '' });

  const canManage = user?.role === 'super_admin' || user?.role === 'development_manager';

  useEffect(() => {
    if (targets) {
      setForm({
        calls: String(targets.callsDailyTarget),
        appointments: String(targets.appointmentsDailyTarget),
        newClients: String(targets.newClientsDailyTarget),
      });
    }
  }, [targets]);

  if (!canManage || !targets) return null;

  const handleSave = async () => {
    if (!targets.id || !user) return;
    setSaving(true);
    setSaved(false);
    try {
      const input: ActivityTargets = {
        callsDailyTarget: Math.max(1, Number(form.calls) || 1),
        appointmentsDailyTarget: Math.max(1, Number(form.appointments) || 1),
        newClientsDailyTarget: Math.max(1, Number(form.newClients) || 1),
      };
      await updateActivityTargets(targets.id, input, user.id);
      const refreshed = await fetchActivityTargets();
      onSaved(refreshed);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="card print:hidden">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 text-sm font-medium text-secondary-700"
      >
        <Settings2 className="w-4 h-4" />
        إعدادات الأهداف اليومية (لحساب درجة النشاط فى التقييم الشامل)
      </button>

      {open && (
        <div className="mt-4 space-y-3">
          <p className="text-xs text-secondary-500">
            الأهداف دي بتتقارن بمتوسط الفعلي اليومي لأي فترة مختارة (المكالمات/المواعيد/العملاء
            الجدد)، وبتمثل 30% من "التقييم الشامل" النهائي (70% الباقية نسبة تحقيق الهدف المالي).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="input-label">هدف المكالمات اليومي</label>
              <input
                type="number"
                min={1}
                value={form.calls}
                onChange={(e) => setForm((f) => ({ ...f, calls: e.target.value }))}
                className="input-field mt-1"
              />
            </div>
            <div>
              <label className="input-label">هدف المواعيد اليومي</label>
              <input
                type="number"
                min={1}
                value={form.appointments}
                onChange={(e) => setForm((f) => ({ ...f, appointments: e.target.value }))}
                className="input-field mt-1"
              />
            </div>
            <div>
              <label className="input-label">هدف العملاء الجدد اليومي</label>
              <input
                type="number"
                min={1}
                value={form.newClients}
                onChange={(e) => setForm((f) => ({ ...f, newClients: e.target.value }))}
                className="input-field mt-1"
              />
            </div>
          </div>
          <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm">
            {saved ? <Check className="w-4 h-4" /> : null}
            {saving ? 'جارِ الحفظ...' : saved ? 'تم الحفظ' : 'حفظ الأهداف'}
          </button>
        </div>
      )}
    </div>
  );
}
