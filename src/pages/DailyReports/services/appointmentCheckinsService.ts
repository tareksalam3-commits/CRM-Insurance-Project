import { supabase } from '../../../lib/supabase';
import { dalRead } from '../../../lib/dataAccessLayer';
import type { AgentAppointmentCheckin, CreateAppointmentCheckinInput } from '../types';

/** كل مواعيد إيجنت واحد خلال يوم معيّن (بترتيب الوقت) — تُستخدم من الإيجنت
 * نفسه لعرض قائمة "مواعيدي"، ومن رئيس مجموعته لعرض المواعيد اللي دخّلها
 * له ضمن نموذج الإدخال اليومي */
export async function fetchAgentAppointments(
  agentId: string,
  dayStart: string,
  dayEnd: string,
): Promise<AgentAppointmentCheckin[]> {
  const result = await dalRead(
    `appointmentCheckins:day:${agentId}:${dayStart}:${dayEnd}`,
    async () => {
      const { data, error } = await supabase
        .from('agent_appointment_checkins')
        .select('*')
        .eq('agent_id', agentId)
        .gte('appointment_time', dayStart)
        .lte('appointment_time', dayEnd)
        .order('appointment_time', { ascending: true });
      if (error) throw error;
      return (data || []) as AgentAppointmentCheckin[];
    },
    { emptyValue: [] as AgentAppointmentCheckin[] },
  );
  return result.data;
}

/** إضافة معاد جديد لإيجنت (اسم عميل + وقت)، بدون أي موقع مسجَّل بعد —
 * enteredBy هو رئيس المجموعة العادةً، أو الإيجنت نفسه لو وسيط حر */
export async function createAppointment(
  input: CreateAppointmentCheckinInput,
  enteredBy: string,
): Promise<AgentAppointmentCheckin> {
  const { data, error } = await supabase
    .from('agent_appointment_checkins')
    .insert({
      agent_id: input.agentId,
      entered_by: enteredBy,
      client_name: input.clientName,
      appointment_time: input.appointmentTime,
    })
    .select()
    .single();
  if (error) throw error;
  return data as AgentAppointmentCheckin;
}

/** تثبيت الموقع الجغرافي الحالي على معاد موجود — بتُستدعى من الإيجنت نفسه
 * فقط وقت وصوله الفعلي (عبر دالة قاعدة البيانات check_in_own_appointment) */
export async function checkInAppointment(
  appointmentId: string,
  latitude: number,
  longitude: number,
): Promise<AgentAppointmentCheckin> {
  const { data, error } = await supabase.rpc('check_in_own_appointment', {
    p_appointment_id: appointmentId,
    p_latitude: latitude,
    p_longitude: longitude,
  });
  if (error) throw error;
  return data as AgentAppointmentCheckin;
}

/** حذف معاد — متاح فقط لمن أدخله (رئيس المجموعة، أو الوسيط الحر لنفسه) */
export async function deleteAppointment(appointmentId: string): Promise<void> {
  const { error } = await supabase.from('agent_appointment_checkins').delete().eq('id', appointmentId);
  if (error) throw error;
}
