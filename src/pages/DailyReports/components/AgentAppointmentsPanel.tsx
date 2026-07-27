import { useEffect, useState, useCallback } from 'react';
import { Loader2, Plus, Trash2, MapPin, Clock, CheckCircle2 } from 'lucide-react';

import { fetchAgentAppointments, createAppointment, deleteAppointment } from '../services/appointmentCheckinsService';
import type { AgentAppointmentCheckin } from '../types';

interface AgentAppointmentsPanelProps {
  agentId: string;
  /** تاريخ اليوم المعروض بصيغة yyyy-MM-dd (نفس تاريخ التقرير المختار فوق) */
  dateStr: string;
  enteredBy: string;
  /** لو اليوم ده متعلّم outdoor (مفيش مواعيد محددة سلفًا)، الإيجنت نفسه هو
   * من هيدخل الأماكن اللي راحها من تطبيقه — رئيس المجموعة مش محتاج يدخل
   * مواعيد هنا */
  isOutdoor: boolean;
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

export function AgentAppointmentsPanel({ agentId, dateStr, enteredBy, isOutdoor }: AgentAppointmentsPanelProps) {
  const [appointments, setAppointments] = useState<AgentAppointmentCheckin[]>([]);
  const [loading, setLoading] = useState(true);
  const [clientName, setClientName] = useState('');
  const [time, setTime] = useState('10:00');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dayStart = `${dateStr}T00:00:00`;
  const dayEnd = `${dateStr}T23:59:59`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAgentAppointments(agentId, dayStart, dayEnd);
      setAppointments(data);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, dayStart, dayEnd]);

  useEffect(() => { void load(); }, [load]);

  async function handleAdd() {
    if (!clientName.trim()) { setError('اكتب اسم العميل'); return; }
    if (!time) { setError('حدّد وقت المعاد'); return; }
    setSaving(true);
    setError(null);
    try {
      const appointmentTime = new Date(`${dateStr}T${time}:00`).toISOString();
      const created = await createAppointment({ agentId, clientName: clientName.trim(), appointmentTime }, enteredBy);
      setAppointments((prev) => [...prev, created].sort((a, b) => a.appointment_time.localeCompare(b.appointment_time)));
      setClientName('');
    } catch {
      setError('تعذّر إضافة المعاد. حاول مرة أخرى.');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteAppointment(id);
      setAppointments((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setError('تعذّر حذف المعاد. حاول مرة أخرى.');
    }
  }

  return (
    <div className="space-y-2 border-t border-secondary-100 pt-3">
      <div className="flex items-center gap-1.5 text-xs font-bold text-secondary-500 uppercase tracking-wide">
        <MapPin className="w-3.5 h-3.5" /> مواعيد اليوم وتثبيت الموقع
      </div>

      {loading ? (
        <div className="text-sm text-secondary-400 flex items-center gap-1.5">
          <Loader2 className="w-4 h-4 animate-spin" /> جارِ التحميل...
        </div>
      ) : (
        <>
          {appointments.length > 0 && (
            <ul className="space-y-1.5">
              {appointments.map((a) => (
                <li key={a.id} className="flex items-center justify-between text-sm bg-secondary-50 rounded-lg px-2.5 py-1.5">
                  <div className="flex items-center gap-2 min-w-0">
                    <Clock className="w-3.5 h-3.5 text-secondary-400 shrink-0" />
                    <span className="font-medium text-secondary-800">{formatTime(a.appointment_time)}</span>
                    <span className="text-secondary-600 truncate">{a.client_name}</span>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {a.checked_in_at ? (
                      <span className="badge badge-success flex items-center gap-1">
                        <CheckCircle2 className="w-3.5 h-3.5" /> تم تسجيل الموقع
                      </span>
                    ) : (
                      <span className="text-xs text-secondary-400">بانتظار وصول الإيجنت</span>
                    )}
                    <button
                      className="text-secondary-400 hover:text-error-600"
                      onClick={() => handleDelete(a.id)}
                      title="حذف المعاد"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}

          {isOutdoor ? (
            <p className="text-sm text-secondary-500">
              اليوم ده متعلّم outdoor — الإيجنت هو نفسه اللي هيدخل الأماكن اللي راحها ويثبت موقعه عليها من تطبيقه.
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div className="space-y-1 flex-1 min-w-[140px]">
                <label className="input-label">اسم العميل</label>
                <input
                  type="text"
                  className="input-field"
                  value={clientName}
                  onChange={(e) => setClientName(e.target.value)}
                  placeholder="اسم العميل"
                />
              </div>
              <div className="space-y-1">
                <label className="input-label">وقت المعاد</label>
                <input
                  type="time"
                  className="input-field"
                  value={time}
                  onChange={(e) => setTime(e.target.value)}
                />
              </div>
              <button className="btn btn-secondary btn-sm flex items-center gap-1" disabled={saving} onClick={handleAdd}>
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} إضافة معاد
              </button>
            </div>
          )}

          {error && <p className="text-sm text-error-600">{error}</p>}
        </>
      )}
    </div>
  );
}
