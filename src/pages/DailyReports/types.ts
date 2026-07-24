// أنواع بيانات صفحة "تقارير العمل اليومية" (نظام الإحصائيات المجمّعة) —
// معزولة بالكامل عن باقي النظام. الإيجنت يسلّم تقريره الورقي خارج التطبيق،
// ورئيس المجموعة هو من يدخل إجمالي الإحصائيات لكل فرد فى فريقه هنا.

import type { UserRole } from '../../lib/supabase';

export type AppointmentsQuality = 'excellent' | 'average' | 'weak';

export const APPOINTMENTS_QUALITY_LABELS: Record<AppointmentsQuality, string> = {
  excellent: 'ممتاز',
  average: 'متوسط',
  weak: 'ضعيف',
};

export const APPOINTMENTS_QUALITY_BADGE_CLASS: Record<AppointmentsQuality, string> = {
  excellent: 'badge badge-success',
  average: 'badge badge-warning',
  weak: 'badge badge-error',
};

/** صف مخزَّن فعلياً فى daily_agent_stats — إحصائية يوم واحد لإيجنت واحد،
 * أدخلها رئيس مجموعته بعد استلام التقرير الورقي منه */
export interface DailyAgentStatRow {
  id: string;
  agent_id: string;
  entered_by: string;
  report_date: string;
  punctuality_ok: boolean;
  calls_actual: number;
  calls_to_appointments: number;
  appointments_actual: number;
  appointments_quality: AppointmentsQuality | null;
  new_clients: number;
  is_outdoor: boolean;
  created_at: string;
  updated_at: string;
}

export interface UpsertAgentStatInput {
  agentId: string;
  reportDate: string; // yyyy-MM-dd
  punctualityOk: boolean;
  callsActual: number;
  callsToAppointments: number;
  appointmentsActual: number;
  appointmentsQuality: AppointmentsQuality | null;
  newClients: number;
  isOutdoor: boolean;
}

/** صف واحد فى نموذج إدخال رئيس المجموعة — عضو من فريقه، مع القيم المحفوظة
 * مسبقاً لنفس اليوم إن وُجدت (existing) أو قيم فارغة لو لسه لم يُسجَّل */
export interface EntryFormRow {
  agentId: string;
  agentName: string;
  existing: DailyAgentStatRow | null;
  punctualityOk: boolean | null;
  callsActual: string;
  callsToAppointments: string;
  appointmentsActual: string;
  appointmentsQuality: AppointmentsQuality | null;
  newClients: string;
  isOutdoor: boolean;
}

/** إجمالي مجمّع لإحصائيات فترة معينة (فرد أو فريق) — يُحسب ديناميكياً وقت
 * العرض من صفوف daily_agent_stats المخزَّنة، ولا يُخزَّن أبداً بنفسه */
export interface StatsAggregate {
  entriesCount: number;
  punctualityOkCount: number;
  callsActual: number;
  callsToAppointments: number;
  appointmentsActual: number;
  appointmentsQualityCounts: Record<AppointmentsQuality, number>;
  newClients: number;
  outdoorDaysCount: number;
}

export const EMPTY_STATS_AGGREGATE: StatsAggregate = {
  entriesCount: 0,
  punctualityOkCount: 0,
  callsActual: 0,
  callsToAppointments: 0,
  appointmentsActual: 0,
  appointmentsQualityCounts: { excellent: 0, average: 0, weak: 0 },
  newClients: 0,
  outdoorDaysCount: 0,
};

/** عقدة فى شجرة الإحصائيات الهرمية — تمثّل عضواً واحداً (مدير أو إيجنت) مع
 * مرؤوسيه المباشرين متداخلين تحته، بنفس الهيكل التنظيمي بالظبط، بحيث يقدر
 * كل مستوى (رئيس مجموعة/مراقب/مراقب عام/مدير تطوير) ينزل لأي فرد بعينه */
export interface StatsTreeNode {
  userId: string;
  name: string;
  role: UserRole;
  roleLabel: string;
  roleLevel: number;
  /** إجمالي إحصائيات هذا العضو الشخصية (لو كان إيجنت) خلال الفترة المختارة
   * — null لأي درجة إدارية لا تُسجَّل إحصائياتها الشخصية بهذه الطريقة */
  own: StatsAggregate | null;
  /** إجمالي إحصائيات كامل النطاق تحت هذا العضو (هو نفسه + كل مرؤوسيه) */
  subtree: StatsAggregate;
  /** صفوف الإحصائيات الخام لهذا العضو نفسه خلال الفترة (لو إيجنت) */
  ownEntries: DailyAgentStatRow[];
  children: StatsTreeNode[];
}
