import { useEffect, useState, useCallback } from 'react';
import { Loader2, Clock, CheckCircle2, AlertCircle, Navigation, Plus, Trash2, ExternalLink } from 'lucide-react';

import {
  fetchAgentAppointments,
  fetchIsOutdoorDay,
  checkInAppointment,
  createAppointment,
  deleteAppointment,
} from '../services/appointmentCheckinsService';
import { formatDateInput, formatReportDate, formatReportDay, parseDateInput } from '../utils';
import type { AgentAppointmentCheckin } from '../types';

interface AgentAppointmentsViewProps {
  agentId: string;
  /** الوسيط الحر بيقدر يضيف مواعيده لنفسه دايمًا (مالوش رئيس مجموعة يدخل
   * له). الإيجنت العادي بيقدر يضيف بنفسه بس لو يومه ده متعلّم "outdoor"
   * عند رئيس مجموعته (يعني مفيش مواعيد محددة سلفًا يدخلها له) — غير كده
   * بيشوف بس المواعيد اللي رئيس مجموعته دخّلها له */
  role: 'agent' | 'premium_agent';
}

function formatTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' });
}

function geolocationErrorMessage(err: GeolocationPositionError): string {
  if (err.code === err.PERMISSION_DENIED) {
    return 'تم رفض إذن الوصول للموقع. فعّل صلاحية الموقع لهذا الموقع من إعدادات المتصفح وحاول مرة أخرى.';
  }
  if (err.code === err.POSITION_UNAVAILABLE) {
    return 'تعذّر تحديد الموقع الحالي. تأكد من تفعيل خدمة الموقع (GPS) وحاول مرة أخرى.';
  }
  return 'انتهت مهلة تحديد الموقع. حاول مرة أخرى فى مكان مفتوح.';
}

function getCurrentPosition(): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('geolocation_unsupported'));
      return;
    }
    navigator.geolocation.getCurrentPosition(resolve, reject, {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 0,
    });
  });
}

export function AgentAppointmentsView({ agentId, role }: AgentAppointmentsViewProps) {
  const [date, setDate] = useState(() => new Date());
  const [appointments, setAppointments] = useState<AgentAppointmentCheckin[]>([]);
  const [loading, setLoading] = useState(true);
  const [isOutdoorDay, setIsOutdoorDay] = useState(false);
  const [checkingInId, setCheckingInId] = useState<string | null>(null);
  const [checkInError, setCheckInError] = useState<{ id: string; message: string } | null>(null);

  const [clientName, setClientName] = useState('');
  const [time, setTime] = useState('10:00');
  const [addSaving, setAddSaving] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const dateStr = formatDateInput(date);
  const dayStart = `${dateStr}T00:00:00`;
  const dayEnd = `${dateStr}T23:59:59`;

  // الوسيط الحر بيقدر يضيف دايمًا. الإيجنت العادي بيقدر يضيف بس لو يومه ده
  // متعلّم outdoor عند رئيس مجموعته
  const canAddOwn = role === 'premium_agent' || isOutdoorDay;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [appointmentsData, outdoorStatus] = await Promise.all([
        fetchAgentAppointments(agentId, dayStart, dayEnd),
        role === 'agent' ? fetchIsOutdoorDay(agentId, dateStr) : Promise.resolve(false),
      ]);
      setAppointments(appointmentsData);
      setIsOutdoorDay(outdoorStatus);
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [agentId, dayStart, dayEnd, dateStr, role]);

  useEffect(() => { void load(); }, [load]);

  async function handleCheckIn(appointmentId: string) {
    setCheckingInId(appointmentId);
    setCheckInError(null);
    try {
      const position = await getCurrentPosition();
      const updated = await checkInAppointment(appointmentId, position.coords.latitude, position.coords.longitude);
      setAppointments((prev) => prev.map((a) => (a.id === appointmentId ? updated : a)));
    } catch (err) {
      const message = err instanceof GeolocationPositionError
        ? geolocationErrorMessage(err)
        : (err as Error)?.message === 'geolocation_unsupported'
          ? 'المتصفح المستخدم لا يدعم تحديد الموقع.'
          : 'تعذّر تسجيل الموقع. حاول مرة أخرى.';
      setCheckInError({ id: appointmentId, message });
    } finally {
      setCheckingInId(null);
    }
  }

  async function handleAdd() {
    if (!clientName.trim()) { setAddError('اكتب اسم العميل'); return; }
    if (!time) { setAddError('حدّد وقت المعاد'); return; }
    setAddSaving(true);
    setAddError(null);
    try {
      const appointmentTime = new Date(`${dateStr}T${time}:00`).toISOString();
      const created = await createAppointment({ agentId, clientName: clientName.trim(), appointmentTime }, agentId);
      setAppointments((prev) => [...prev, created].sort((a, b) => a.appointment_time.localeCompare(b.appointment_time)));
      setClientName('');
    } catch {
      setAddError('تعذّر إضافة المعاد. حاول مرة أخرى.');
    } finally {
      setAddSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await deleteAppointment(id);
      setAppointments((prev) => prev.filter((a) => a.id !== id));
    } catch {
      setAddError('تعذّر حذف المعاد. حاول مرة أخرى.');
    }
  }

  return (
    <div className="space-y-4">
      <div className="card">
        <div className="space-y-1 max-w-xs">
          <label className="input-label">اليوم</label>
          <input
            type="date"
            className="input-field"
            value={dateStr}
            onChange={(e) => { if (e.target.value) setDate(parseDateInput(e.target.value)); }}
          />
          <p className="text-xs text-secondary-400">{formatReportDate(date)} ({formatReportDay(date)})</p>
        </div>
      </div>

      {canAddOwn && (
        <div className="card space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-secondary-500 uppercase tracking-wide">
            <Plus className="w-3.5 h-3.5" /> {role === 'agent' ? 'إضافة مكان تمت زيارته (عمل ميدانى outdoor)' : 'إضافة معاد'}
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1 flex-1 min-w-[140px]">
              <label className="input-label">{role === 'agent' ? 'اسم العميل / المكان' : 'اسم العميل'}</label>
              <input type="text" className="input-field" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="اسم العميل" />
            </div>
            <div className="space-y-1">
              <label className="input-label">الوقت</label>
              <input type="time" className="input-field" value={time} onChange={(e) => setTime(e.target.value)} />
            </div>
            <button className="btn btn-secondary btn-sm flex items-center gap-1" disabled={addSaving} onClick={handleAdd}>
              {addSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />} إضافة
            </button>
          </div>
          {addError && <p className="text-sm text-error-600">{addError}</p>}
        </div>
      )}

      {!loading && role === 'agent' && !isOutdoorDay && appointments.length === 0 && (
        <div className="card text-sm text-secondary-500">
          مفيش مواعيد مسجّلة لهذا اليوم حتى الآن. لو كان عملك ميدانى (outdoor) بدون مواعيد محددة، اطلب من رئيس مجموعتك يعلّم اليوم ده كـ outdoor عشان تقدر تدخل الأماكن اللي رحتها بنفسك.
        </div>
      )}

      {loading ? (
        <div className="card text-center py-8 text-secondary-400">
          <Loader2 className="w-5 h-5 animate-spin inline-block ms-2" /> جارِ التحميل...
        </div>
      ) : appointments.length === 0 ? (
        role === 'agent' && !isOutdoorDay ? null : (
          <div className="card text-center py-8 text-secondary-400">لا توجد مواعيد مسجّلة لهذا اليوم</div>
        )
      ) : (
        <div className="space-y-3">
          {appointments.map((a) => (
            <div key={a.id} className="card space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Clock className="w-4 h-4 text-secondary-400" />
                  <span className="font-bold text-secondary-900">{formatTime(a.appointment_time)}</span>
                  <span className="text-secondary-700">{a.client_name}</span>
                </div>
                {canAddOwn && !a.checked_in_at && (
                  <button className="text-secondary-400 hover:text-error-600" onClick={() => handleDelete(a.id)} title="حذف المعاد">
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>

              {a.checked_in_at ? (
                <div className="space-y-2">
                  <span className="badge badge-success flex items-center gap-1 w-fit">
                    <CheckCircle2 className="w-3.5 h-3.5" /> تم تسجيل الموقع الساعة {formatTime(a.checked_in_at)}
                  </span>
                  <div className="rounded-lg overflow-hidden border border-secondary-100 h-40">
                    <iframe
                      title={`موقع معاد ${a.client_name}`}
                      className="w-full h-full"
                      loading="lazy"
                      src={`https://www.openstreetmap.org/export/embed.html?bbox=${a.longitude! - 0.005}%2C${a.latitude! - 0.005}%2C${a.longitude! + 0.005}%2C${a.latitude! + 0.005}&layer=mapnik&marker=${a.latitude}%2C${a.longitude}`}
                    />
                  </div>
                  <a
                    href={`https://www.google.com/maps?q=${a.latitude},${a.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-primary-600 hover:underline flex items-center gap-1 w-fit"
                  >
                    <ExternalLink className="w-3.5 h-3.5" /> فتح فى خرائط جوجل
                  </a>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <button
                    className="btn btn-primary btn-sm flex items-center gap-1.5"
                    disabled={checkingInId === a.id}
                    onClick={() => handleCheckIn(a.id)}
                  >
                    {checkingInId === a.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Navigation className="w-4 h-4" />}
                    تسجيل الموقع الآن
                  </button>
                  {checkInError?.id === a.id && (
                    <p className="text-sm text-error-600 flex items-center gap-1">
                      <AlertCircle className="w-4 h-4 shrink-0" /> {checkInError.message}
                    </p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
