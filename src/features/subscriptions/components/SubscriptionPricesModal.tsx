import { useState, useMemo } from 'react';
import { X, Loader2, CheckCircle2, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { ROLE_LABELS, type UserRole } from '../../../lib/supabase';
import { updatePlanPrice, type AdminPlanPriceRow } from '../services/adminService';
import type { SubscriptionDuration } from '../types';

// الدرجات القابلة للاشتراك المستقل فقط (الوكلاء مستثنون — بيتفعّلوا مع رئيس مجموعتهم)
const PRICED_ROLES: UserRole[] = ['group_leader', 'supervisor', 'general_supervisor', 'development_manager'];

// تعديل أسعار الاشتراك لكل درجة وظيفية × كل مدة، من لوحة إدارة الاشتراكات
export function SubscriptionPricesModal({
  prices, durations, onClose, onDone,
}: {
  prices: AdminPlanPriceRow[];
  durations: SubscriptionDuration[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [values, setValues] = useState<Record<string, string>>(() => {
    const initial: Record<string, string> = {};
    prices.forEach((p) => { initial[p.id] = String(p.price); });
    return initial;
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const grid = useMemo(() => {
    return PRICED_ROLES.map((role) => ({
      role,
      cells: durations.map((d) => ({
        duration: d,
        row: prices.find((p) => p.role === role && p.duration_id === d.id) || null
      }))
    }));
  }, [prices, durations]);

  const handleSave = async () => {
    setError(null);

    const changed = prices.filter((p) => {
      const v = values[p.id];
      return v !== undefined && Number(v) !== Number(p.price);
    });

    if (changed.length === 0) {
      onClose();
      return;
    }

    for (const p of changed) {
      const n = Number(values[p.id]);
      if (Number.isNaN(n) || n < 0) {
        setError('تأكد إن كل الأسعار أرقام صحيحة موجبة');
        return;
      }
    }

    setSaving(true);
    try {
      for (const p of changed) {
        await updatePlanPrice(p.id, { price: Number(values[p.id]) });
      }
      onDone();
    } catch (err: any) {
      setError(err?.message || 'حدث خطأ أثناء حفظ الأسعار');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-2xl max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-secondary-100 px-5 py-4 flex items-center justify-between">
          <div>
            <h3 className="font-bold text-secondary-900">أسعار الاشتراكات</h3>
            <p className="text-xs text-secondary-500">سعر كل درجة وظيفية حسب مدة الاشتراك (بالجنيه المصري)</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary-100">
            <X className="w-5 h-5 text-secondary-500" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {grid.map(({ role, cells }) => (
            <div key={role} className="border border-secondary-200 rounded-xl p-4">
              <p className="text-sm font-bold text-secondary-800 mb-3">{ROLE_LABELS[role]}</p>
              <div className={clsx('grid gap-3', cells.length === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2')}>
                {cells.map(({ duration, row }) => (
                  <div key={duration.id}>
                    <label className="text-xs text-secondary-500 block mb-1.5">{duration.label}</label>
                    {row ? (
                      <div className="relative">
                        <input
                          type="number"
                          min={0}
                          step="0.01"
                          value={values[row.id] ?? ''}
                          onChange={(e) => setValues((v) => ({ ...v, [row.id]: e.target.value }))}
                          className="input-field pl-12"
                          dir="ltr"
                        />
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-secondary-400">ج.م</span>
                      </div>
                    ) : (
                      <p className="text-xs text-secondary-400 py-2.5">لا يوجد سعر معرّف لهذه المدة</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

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
            حفظ الأسعار
          </button>
        </div>
      </div>
    </div>
  );
}
