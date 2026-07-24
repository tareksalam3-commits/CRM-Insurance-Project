import { useEffect, useState, useCallback } from 'react';
import type { ReactNode } from 'react';
import { CheckCircle2, Loader2, AlertCircle, BadgeCheck, Phone, CalendarClock, UserPlus } from 'lucide-react';

import { useAuth } from '../../../hooks/useAuth';
import { useBranchContext } from '../../../lib/branchContext';
import { fetchEntryFormRows, upsertAgentStat } from '../services/dailyStatsService';
import { toNonNegativeInt, formatDateInput, formatReportDate, formatReportDay, parseDateInput } from '../utils';
import { APPOINTMENTS_QUALITY_LABELS } from '../types';
import type { AppointmentsQuality, EntryFormRow } from '../types';

interface RowState extends EntryFormRow {
  saving: boolean;
  saved: boolean;
  error: string | null;
}

function toRowState(row: EntryFormRow): RowState {
  return { ...row, saving: false, saved: row.existing !== null, error: null };
}

function validateRow(row: RowState): string | null {
  if (row.punctualityOk === null) return 'حدّد الالتزام بالمواعيد والزي الرسمي';
  const callsActual = toNonNegativeInt(row.callsActual);
  const callsToAppointments = toNonNegativeInt(row.callsToAppointments);
  const appointmentsActual = toNonNegativeInt(row.appointmentsActual);
  if (callsToAppointments > callsActual) return 'عدد المكالمات التي نتج عنها مواعيد أكبر من إجمالي المكالمات';
  if (appointmentsActual > 0 && !row.appointmentsQuality) return 'حدّد جودة المواعيد بعد المراجعة';
  return null;
}

function SectionHeading({ icon, label }: { icon: ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-1.5 text-xs font-bold text-secondary-500 uppercase tracking-wide">
      {icon}
      {label}
    </div>
  );
}

export function StatsEntryForm() {
  const { user } = useAuth();
  const { currentBranchId } = useBranchContext();

  const [reportDate, setReportDate] = useState(() => new Date());
  const [rows, setRows] = useState<RowState[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const dateStr = formatDateInput(reportDate);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setLoadError(null);
    try {
      const data = await fetchEntryFormRows(user.id, dateStr, currentBranchId);
      setRows(data.map(toRowState));
    } catch {
      setLoadError('تعذّر تحميل بيانات الفريق. حاول مرة أخرى.');
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, dateStr, currentBranchId]);

  useEffect(() => { void load(); }, [load]);

  function updateRow(agentId: string, patch: Partial<RowState>) {
    setRows((prev) => prev.map((r) => (r.agentId === agentId ? { ...r, ...patch, saved: false, error: null } : r)));
  }

  async function saveRow(agentId: string) {
    if (!user) return;
    const row = rows.find((r) => r.agentId === agentId);
    if (!row) return;

    const error = validateRow(row);
    if (error) {
      updateRow(agentId, { error });
      return;
    }

    updateRow(agentId, { saving: true, error: null });
    try {
      const appointmentsActual = toNonNegativeInt(row.appointmentsActual);
      const saved = await upsertAgentStat(
        {
          agentId,
          reportDate: dateStr,
          punctualityOk: row.punctualityOk === true,
          callsActual: toNonNegativeInt(row.callsActual),
          callsToAppointments: toNonNegativeInt(row.callsToAppointments),
          appointmentsActual,
          appointmentsQuality: appointmentsActual > 0 ? row.appointmentsQuality : null,
          newClients: toNonNegativeInt(row.newClients),
          isOutdoor: row.isOutdoor,
        },
        user.id,
      );
      setRows((prev) => prev.map((r) => (r.agentId === agentId
        ? { ...r, existing: saved, saving: false, saved: true, error: null }
        : r)));
    } catch {
      updateRow(agentId, { saving: false, error: 'تعذّر الحفظ. حاول مرة أخرى.' });
    }
  }

  if (!user) return null;

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="space-y-1 max-w-xs">
          <label className="input-label">تاريخ التقرير</label>
          <input
            type="date"
            className="input-field"
            value={dateStr}
            max={formatDateInput(new Date())}
            onChange={(e) => { if (e.target.value) setReportDate(parseDateInput(e.target.value)); }}
          />
          <p className="text-xs text-secondary-400">{formatReportDate(reportDate)} ({formatReportDay(reportDate)})</p>
        </div>
      </div>

      {loading && (
        <div className="card text-center py-8 text-secondary-400">
          <Loader2 className="w-5 h-5 animate-spin inline-block ms-2" /> جارِ التحميل...
        </div>
      )}

      {!loading && loadError && (
        <div className="card text-center py-8 text-error-600">{loadError}</div>
      )}

      {!loading && !loadError && rows.length === 0 && (
        <div className="card text-center py-8 text-secondary-400">لا يوجد أفراد فى فريقك حالياً</div>
      )}

      {!loading && !loadError && rows.map((row) => (
        <div key={row.agentId} className="card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-bold text-secondary-900">{row.agentName}</h3>
            {row.saved && !row.saving && (
              <span className="badge badge-success flex items-center gap-1">
                <CheckCircle2 className="w-3.5 h-3.5" /> محفوظ
              </span>
            )}
          </div>

          {/* قسم الالتزام */}
          <div className="space-y-2">
            <SectionHeading icon={<BadgeCheck className="w-3.5 h-3.5" />} label="قسم الالتزام" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="input-label">الالتزام بالمواعيد والزي الرسمي</label>
                <select
                  className="input-field"
                  value={row.punctualityOk === null ? '' : row.punctualityOk ? 'yes' : 'no'}
                  onChange={(e) => updateRow(row.agentId, { punctualityOk: e.target.value === '' ? null : e.target.value === 'yes' })}
                >
                  <option value="">اختر</option>
                  <option value="yes">نعم</option>
                  <option value="no">لا</option>
                </select>
              </div>
            </div>
          </div>

          {/* قسم المكالمات */}
          <div className="space-y-2 border-t border-secondary-100 pt-3">
            <SectionHeading icon={<Phone className="w-3.5 h-3.5" />} label="قسم المكالمات" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="input-label">عدد مكالمات فعلية</label>
                <input
                  type="number"
                  min={0}
                  className="input-field"
                  value={row.callsActual}
                  onChange={(e) => updateRow(row.agentId, { callsActual: e.target.value })}
                />
              </div>

              <div className="space-y-1">
                <label className="input-label">نتج عنها تحديد مواعيد</label>
                <input
                  type="number"
                  min={0}
                  className="input-field"
                  value={row.callsToAppointments}
                  onChange={(e) => updateRow(row.agentId, { callsToAppointments: e.target.value })}
                />
              </div>
            </div>
          </div>

          {/* قسم المواعيد (عدد المواعيد الفعلية ثم جودتها مباشرة، ومربع outdoor) */}
          <div className="space-y-2 border-t border-secondary-100 pt-3">
            <SectionHeading icon={<CalendarClock className="w-3.5 h-3.5" />} label="قسم المواعيد" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="input-label">عدد المواعيد الفعلية</label>
                <input
                  type="number"
                  min={0}
                  className="input-field"
                  value={row.appointmentsActual}
                  onChange={(e) => updateRow(row.agentId, { appointmentsActual: e.target.value })}
                />
              </div>

              {toNonNegativeInt(row.appointmentsActual) > 0 && (
                <div className="space-y-1">
                  <label className="input-label">جودة المواعيد بعد المراجعة</label>
                  <select
                    className="input-field"
                    value={row.appointmentsQuality ?? ''}
                    onChange={(e) => updateRow(row.agentId, { appointmentsQuality: (e.target.value || null) as AppointmentsQuality | null })}
                  >
                    <option value="">اختر</option>
                    {(Object.keys(APPOINTMENTS_QUALITY_LABELS) as AppointmentsQuality[]).map((q) => (
                      <option key={q} value={q}>{APPOINTMENTS_QUALITY_LABELS[q]}</option>
                    ))}
                  </select>
                </div>
              )}

              {toNonNegativeInt(row.appointmentsActual) === 0 && (
                <div className="flex items-end pb-1">
                  <label className="flex items-center gap-2 text-sm text-secondary-700">
                    <input
                      type="checkbox"
                      checked={row.isOutdoor}
                      onChange={(e) => updateRow(row.agentId, { isOutdoor: e.target.checked })}
                    />
                    لم يتم عمل مواعيد اليوم — تم العمل بنظام outdoor
                  </label>
                </div>
              )}
            </div>
          </div>

          {/* عملاء جدد (طلبات تأمين) — بعد قسم المواعيد */}
          <div className="space-y-2 border-t border-secondary-100 pt-3">
            <SectionHeading icon={<UserPlus className="w-3.5 h-3.5" />} label="عملاء جدد" />
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="space-y-1">
                <label className="input-label">عملاء جدد (طلبات تأمين)</label>
                <input
                  type="number"
                  min={0}
                  className="input-field"
                  value={row.newClients}
                  onChange={(e) => updateRow(row.agentId, { newClients: e.target.value })}
                />
              </div>
            </div>
          </div>

          {row.error && (
            <p className="text-sm text-error-600 flex items-center gap-1">
              <AlertCircle className="w-4 h-4" /> {row.error}
            </p>
          )}

          <div className="flex justify-end">
            <button className="btn btn-primary btn-sm" disabled={row.saving} onClick={() => saveRow(row.agentId)}>
              {row.saving ? <Loader2 className="w-4 h-4 animate-spin" /> : (row.existing ? 'تحديث' : 'حفظ')}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
