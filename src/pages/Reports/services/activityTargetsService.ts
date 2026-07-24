import { supabase } from '../../../lib/supabase';
import { format } from 'date-fns';
import { dalRead } from '../../../lib/dataAccessLayer';
import type { ActivityTargets } from '../business/performanceScoreCalculator';
import { DEFAULT_ACTIVITY_TARGETS } from '../business/performanceScoreCalculator';
import type { DailyAgentStatRow } from '../../DailyReports/types';

interface ActivityTargetsRow {
  id: string;
  calls_daily_target: number;
  appointments_daily_target: number;
  new_clients_daily_target: number;
}

/** الأهداف اليومية الحالية المستخدمة فى حساب التقييم الشامل — صف واحد فقط
 * (singleton)، وبقيم افتراضية معقولة لو الجدول لسه فاضي لأي سبب */
export async function fetchActivityTargets(): Promise<ActivityTargets & { id: string | null }> {
  const result = await dalRead(
    'reports:performanceActivityTargets',
    async () => {
      const { data, error } = await supabase
        .from('performance_activity_targets')
        .select('id, calls_daily_target, appointments_daily_target, new_clients_daily_target')
        .maybeSingle();
      if (error) throw error;
      if (!data) return { id: null, ...DEFAULT_ACTIVITY_TARGETS };
      const row = data as ActivityTargetsRow;
      return {
        id: row.id,
        callsDailyTarget: row.calls_daily_target,
        appointmentsDailyTarget: row.appointments_daily_target,
        newClientsDailyTarget: row.new_clients_daily_target,
      };
    },
    { emptyValue: { id: null, ...DEFAULT_ACTIVITY_TARGETS } },
  );
  return result.data;
}

/** تعديل الأهداف اليومية — متاح فقط لـ super_admin / development_manager
 * (RLS على performance_activity_targets)، الصفحة نفسها بتخفي النموذج عن
 * غيرهم أصلاً */
export async function updateActivityTargets(
  id: string,
  input: ActivityTargets,
  updatedBy: string,
): Promise<void> {
  const { error } = await supabase
    .from('performance_activity_targets')
    .update({
      calls_daily_target: input.callsDailyTarget,
      appointments_daily_target: input.appointmentsDailyTarget,
      new_clients_daily_target: input.newClientsDailyTarget,
      updated_by: updatedBy,
    })
    .eq('id', id);
  if (error) throw error;
}

/** كل صفوف daily_agent_stats لمجموعة من المستخدمين (وكلاء أو نطاق كامل)
 * خلال فترة معينة — تُستخدم لحساب درجة النشاط، سواء لفرد واحد أو لمجموعة/
 * نطاق كامل (بتجميع كل الصفوف قبل حساب الدرجة، بنفس معادلة الوكيل بالظبط) */
export async function fetchDailyStatsForUsers(
  userIds: string[],
  start: Date,
  end: Date,
): Promise<DailyAgentStatRow[]> {
  if (userIds.length === 0) return [];
  const result = await dalRead(
    `reports:dailyStatsForUsers:${userIds.slice().sort().join(',')}:${format(start, 'yyyy-MM-dd')}:${format(end, 'yyyy-MM-dd')}`,
    async () => {
      const { data, error } = await supabase
        .from('daily_agent_stats')
        .select('*')
        .in('agent_id', userIds)
        .gte('report_date', format(start, 'yyyy-MM-dd'))
        .lte('report_date', format(end, 'yyyy-MM-dd'));
      if (error) throw error;
      return (data || []) as DailyAgentStatRow[];
    },
    { emptyValue: [] as DailyAgentStatRow[] },
  );
  return result.data;
}
