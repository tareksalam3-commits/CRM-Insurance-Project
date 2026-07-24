import { supabase, ROLE_LABELS, getRoleLevel, type UserRole } from '../../../lib/supabase';
import { dalRead } from '../../../lib/dataAccessLayer';
import { fetchBranchRoleMap } from '../../../lib/branchHierarchy';
import type {
  DailyAgentStatRow,
  EntryFormRow,
  StatsAggregate,
  StatsTreeNode,
  UpsertAgentStatInput,
} from '../types';
import { EMPTY_STATS_AGGREGATE } from '../types';

// ── تجميع الأرقام ───────────────────────────────────────────────────────

/** إجمالي مجمّع لمجموعة صفوف إحصائيات (فرد واحد أو أكثر، فترة واحدة أو أكثر) */
export function aggregateEntries(entries: DailyAgentStatRow[]): StatsAggregate {
  const result: StatsAggregate = {
    entriesCount: entries.length,
    punctualityOkCount: 0,
    callsActual: 0,
    callsToAppointments: 0,
    appointmentsActual: 0,
    appointmentsQualityCounts: { excellent: 0, average: 0, weak: 0 },
    newClients: 0,
    outdoorDaysCount: 0,
  };
  for (const e of entries) {
    if (e.punctuality_ok) result.punctualityOkCount += 1;
    result.callsActual += e.calls_actual;
    result.callsToAppointments += e.calls_to_appointments;
    result.appointmentsActual += e.appointments_actual;
    result.newClients += e.new_clients;
    if (e.is_outdoor) result.outdoorDaysCount += 1;
    if (e.appointments_quality) result.appointmentsQualityCounts[e.appointments_quality] += 1;
  }
  return result;
}

export function mergeAggregates(list: StatsAggregate[]): StatsAggregate {
  return list.reduce<StatsAggregate>((acc, a) => ({
    entriesCount: acc.entriesCount + a.entriesCount,
    punctualityOkCount: acc.punctualityOkCount + a.punctualityOkCount,
    callsActual: acc.callsActual + a.callsActual,
    callsToAppointments: acc.callsToAppointments + a.callsToAppointments,
    appointmentsActual: acc.appointmentsActual + a.appointmentsActual,
    appointmentsQualityCounts: {
      excellent: acc.appointmentsQualityCounts.excellent + a.appointmentsQualityCounts.excellent,
      average: acc.appointmentsQualityCounts.average + a.appointmentsQualityCounts.average,
      weak: acc.appointmentsQualityCounts.weak + a.appointmentsQualityCounts.weak,
    },
    newClients: acc.newClients + a.newClients,
    outdoorDaysCount: acc.outdoorDaysCount + a.outdoorDaysCount,
  }), { ...EMPTY_STATS_AGGREGATE, appointmentsQualityCounts: { ...EMPTY_STATS_AGGREGATE.appointmentsQualityCounts } });
}

// ── إدخال رئيس المجموعة ─────────────────────────────────────────────────

interface LightUserRow {
  id: string;
  name: string;
  role: UserRole;
  manager_id: string | null;
  is_active: boolean;
}

/** قائمة أفراد فريق رئيس المجموعة (الإيجنتات المباشرين تحته فقط) — أساس
 * نموذج الإدخال. get_user_subtree_branch_aware ترجّع رئيس المجموعة نفسه +
 * كل مرؤوسيه، فنستبعده هو ونفلتر على درجة "إيجنت" فقط (الوسيط الحر
 * premium_agent لا يظهر هنا، بنفس منطق استبعاده من نظام التقارير سابقاً) */
export async function fetchTeamAgentsForEntry(
  groupLeaderId: string,
  branchId?: string | null,
): Promise<{ id: string; name: string }[]> {
  const result = await dalRead(
    `dailyStats:teamAgents:${groupLeaderId}:${branchId ?? 'none'}`,
    async () => {
      const { data: subtreeIds, error: subtreeError } = await supabase.rpc('get_user_subtree_branch_aware', {
        user_id: groupLeaderId,
        branch_id: branchId ?? null,
      });
      if (subtreeError) throw subtreeError;

      const teamIds: string[] = (subtreeIds || []).filter((id: string) => id !== groupLeaderId);
      if (teamIds.length === 0) return [];

      const { data: usersData, error: usersError } = await supabase
        .from('users')
        .select('id, name, role, manager_id, is_active')
        .in('id', teamIds);
      if (usersError) throw usersError;

      const branchRoles = await fetchBranchRoleMap(branchId, teamIds);

      return (usersData || [])
        .map((u: LightUserRow) => {
          const br = branchRoles.get(u.id);
          return br ? { ...u, role: br.role } : u;
        })
        .filter((u) => u.is_active && u.role === 'agent')
        .map((u) => ({ id: u.id, name: u.name }))
        .sort((a, b) => a.name.localeCompare(b.name, 'ar'));
    },
    { emptyValue: [] as { id: string; name: string }[] },
  );
  return result.data;
}

/** نموذج إدخال رئيس المجموعة ليوم معيّن: كل أفراد فريقه، مع القيم المحفوظة
 * مسبقاً لنفس اليوم إن وُجدت (وإلا صفوف فارغة جاهزة للتعبئة) */
export async function fetchEntryFormRows(
  groupLeaderId: string,
  reportDate: string,
  branchId?: string | null,
): Promise<EntryFormRow[]> {
  const agents = await fetchTeamAgentsForEntry(groupLeaderId, branchId);
  if (agents.length === 0) return [];

  const result = await dalRead(
    `dailyStats:entryForm:${groupLeaderId}:${reportDate}:${branchId ?? 'none'}`,
    async () => {
      const { data, error } = await supabase
        .from('daily_agent_stats')
        .select('*')
        .in('agent_id', agents.map((a) => a.id))
        .eq('report_date', reportDate);
      if (error) throw error;
      return (data || []) as DailyAgentStatRow[];
    },
    { emptyValue: [] as DailyAgentStatRow[] },
  );

  const existingMap = new Map(result.data.map((r) => [r.agent_id, r]));

  return agents.map((a): EntryFormRow => {
    const existing = existingMap.get(a.id) || null;
    return {
      agentId: a.id,
      agentName: a.name,
      existing,
      punctualityOk: existing?.punctuality_ok ?? null,
      callsActual: existing ? String(existing.calls_actual) : '',
      callsToAppointments: existing ? String(existing.calls_to_appointments) : '',
      appointmentsActual: existing ? String(existing.appointments_actual) : '',
      appointmentsQuality: existing?.appointments_quality ?? null,
      newClients: existing ? String(existing.new_clients) : '',
      isOutdoor: existing?.is_outdoor ?? false,
    };
  });
}

/** حفظ/تعديل إحصائية يوم واحد لإيجنت واحد (upsert على agent_id + report_date) */
export async function upsertAgentStat(input: UpsertAgentStatInput, enteredBy: string): Promise<DailyAgentStatRow> {
  const { data, error } = await supabase
    .from('daily_agent_stats')
    .upsert(
      {
        agent_id: input.agentId,
        entered_by: enteredBy,
        report_date: input.reportDate,
        punctuality_ok: input.punctualityOk,
        calls_actual: input.callsActual,
        calls_to_appointments: input.callsToAppointments,
        appointments_actual: input.appointmentsActual,
        appointments_quality: input.appointmentsQuality,
        new_clients: input.newClients,
        is_outdoor: input.isOutdoor,
      },
      { onConflict: 'agent_id,report_date' },
    )
    .select()
    .single();
  if (error) throw error;
  return data as DailyAgentStatRow;
}

// ── العرض المجمّع الهرمي (رئيس مجموعة يشوف فريقه / مراقب فما فوق) ───────

type AnyUserRow = LightUserRow;

/** لو مدير وسيط اتعطّل حسابه ولسه تحته أعضاء نشطون، بيولّدوا فرعاً كاملاً
 * فى الشجرة بدونه — تصل كل عضو نشط بأقرب مدير نشط فوقه (نفس منطق النظام
 * القديم فى fetchTeamReportTree) */
function resolveActiveParents(
  allUsers: Map<string, AnyUserRow>,
  activeIds: Set<string>,
  rootId: string,
): Map<string, string> {
  const resolved = new Map<string, string>();
  function resolve(id: string): string {
    if (resolved.has(id)) return resolved.get(id)!;
    resolved.set(id, rootId);
    const managerId = allUsers.get(id)?.manager_id ?? null;
    let parent: string;
    if (!managerId || managerId === rootId || activeIds.has(managerId)) {
      parent = managerId || rootId;
    } else if (allUsers.has(managerId)) {
      parent = resolve(managerId);
    } else {
      parent = rootId;
    }
    resolved.set(id, parent);
    return parent;
  }
  activeIds.forEach((id) => resolve(id));
  return resolved;
}

/** شجرة الإحصائيات الهرمية الكاملة لكل من هم تحت المستخدم فى الهيكل
 * التنظيمي (بكل المستويات)، خلال فترة زمنية معيّنة — كل إيجنت يظهر مع
 * إجمالي إحصائياته الشخصية المسجَّلة خلال الفترة، وكل مدير وسيط يظهر مع
 * إجمالي كامل نطاقه (هو نفسه + كل مرؤوسيه)، بنفس الهيكل الإداري بالظبط */
export async function fetchStatsTree(
  userId: string,
  startDate: string,
  endDate: string,
  branchId?: string | null,
): Promise<StatsTreeNode[]> {
  const result = await dalRead(
    `dailyStats:tree:${userId}:${startDate}:${endDate}:${branchId ?? 'none'}`,
    async () => {
      const { data: subtreeIds, error: subtreeError } = await supabase.rpc('get_user_subtree_branch_aware', {
        user_id: userId,
        branch_id: branchId ?? null,
      });
      if (subtreeError) throw subtreeError;

      const teamIds: string[] = (subtreeIds || []).filter((id: string) => id !== userId);
      if (teamIds.length === 0) return [];

      const { data: allUsersData, error: usersError } = await supabase
        .from('users')
        .select('id, name, role, manager_id, is_active')
        .in('id', teamIds);
      if (usersError) throw usersError;

      const { data: statsData, error: statsError } = await supabase
        .from('daily_agent_stats')
        .select('*')
        .in('agent_id', teamIds)
        .gte('report_date', startDate)
        .lte('report_date', endDate);
      if (statsError) throw statsError;

      const branchRoles = await fetchBranchRoleMap(branchId, teamIds);
      const allUsersMap = new Map<string, AnyUserRow>();
      (allUsersData || []).forEach((u: AnyUserRow) => {
        const br = branchRoles.get(u.id);
        allUsersMap.set(u.id, br ? { ...u, role: br.role, manager_id: br.manager_id } : u);
      });

      // الوسيط الحر (premium_agent) مستبعد من هذه الشجرة بالكامل، بنفس منطق
      // النظام القديم
      const usersMap = new Map<string, LightUserRow>();
      const activeIds = new Set<string>();
      allUsersMap.forEach((u) => {
        if (u.is_active && u.role !== 'premium_agent') {
          usersMap.set(u.id, u);
          activeIds.add(u.id);
        }
      });

      const entriesByAgent = new Map<string, DailyAgentStatRow[]>();
      (statsData || []).forEach((r: DailyAgentStatRow) => {
        if (!entriesByAgent.has(r.agent_id)) entriesByAgent.set(r.agent_id, []);
        entriesByAgent.get(r.agent_id)!.push(r);
      });

      const effectiveParents = resolveActiveParents(allUsersMap, activeIds, userId);

      const childrenMap = new Map<string, string[]>();
      usersMap.forEach((u) => {
        const parentId = effectiveParents.get(u.id) ?? userId;
        if (!childrenMap.has(parentId)) childrenMap.set(parentId, []);
        childrenMap.get(parentId)!.push(u.id);
      });

      // ترتيب: النطاق الأكبر نشاطاً (أكتر مكالمات مسجّلة) يظهر أولاً
      function totalCallsInSubtree(node: StatsTreeNode): number {
        return node.subtree.callsActual;
      }

      function buildNode(id: string): StatsTreeNode {
        const u = usersMap.get(id)!;
        const isAgent = u.role === 'agent';
        const ownEntries = isAgent ? (entriesByAgent.get(id) || []) : [];
        const own = isAgent ? aggregateEntries(ownEntries) : null;
        const children = (childrenMap.get(id) || [])
          .map((cid) => buildNode(cid))
          .sort((a, b) => {
            const diff = totalCallsInSubtree(b) - totalCallsInSubtree(a);
            return diff !== 0 ? diff : a.name.localeCompare(b.name, 'ar');
          });
        const subtree = mergeAggregates([own || EMPTY_STATS_AGGREGATE, ...children.map((c) => c.subtree)]);
        return {
          userId: id,
          name: u.name,
          role: u.role,
          roleLabel: ROLE_LABELS[u.role],
          roleLevel: getRoleLevel(u.role),
          own,
          subtree,
          ownEntries,
          children,
        };
      }

      return (childrenMap.get(userId) || [])
        .map((id) => buildNode(id))
        .sort((a, b) => {
          const diff = totalCallsInSubtree(b) - totalCallsInSubtree(a);
          return diff !== 0 ? diff : a.name.localeCompare(b.name, 'ar');
        });
    },
    { emptyValue: [] as StatsTreeNode[] },
  );
  return result.data;
}

/** إحصائيات الإيجنت الشخصية فقط، خلال فترة زمنية معيّنة (لعرضه هو لنفسه) */
export async function fetchAgentOwnEntries(
  agentId: string,
  startDate: string,
  endDate: string,
): Promise<DailyAgentStatRow[]> {
  const result = await dalRead(
    `dailyStats:own:${agentId}:${startDate}:${endDate}`,
    async () => {
      const { data, error } = await supabase
        .from('daily_agent_stats')
        .select('*')
        .eq('agent_id', agentId)
        .gte('report_date', startDate)
        .lte('report_date', endDate)
        .order('report_date', { ascending: false });
      if (error) throw error;
      return (data || []) as DailyAgentStatRow[];
    },
    { emptyValue: [] as DailyAgentStatRow[] },
  );
  return result.data;
}
