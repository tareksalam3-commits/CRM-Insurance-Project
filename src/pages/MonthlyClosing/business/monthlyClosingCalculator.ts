import { getRoleLevel, type UserRole } from '../../../lib/supabase';
import type {
  AgentSummary, GroupSummary, SupervisorSummary,
  GroupLeaderAgg, SupervisorAgg, PrintDetailRow, PaymentRow, BasicUser,
} from '../types';

export interface CurrentUserRef {
  id: string;
  name: string;
  role: UserRole;
}

export interface MonthlyClosingSummary {
  supervisors: SupervisorSummary[];
  directAgents: AgentSummary[];
  grandProduction: number;
  grandCollection: number;
  printSupervisors: SupervisorAgg[];
  printDetailRows: PrintDetailRow[];
}

// نفس منطق التجميع الأصلي بالكامل، منقول كما هو دون أي تغيير في السلوك أو الناتج.
export function buildMonthlyClosingSummary(
  user: CurrentUserRef,
  usersData: BasicUser[],
  payments: PaymentRow[],
): MonthlyClosingSummary {
  const usersMap = new Map<string, BasicUser>(usersData.map((u) => [u.id, u]));

  // 4. تجميع على مستوى الوكيل
  const agentMap = new Map<string, AgentSummary>();

  for (const p of payments) {
    const ownerId = p.installment.policy.owner_id;
    if (!agentMap.has(ownerId)) {
      const u = usersMap.get(ownerId);
      if (!u) continue;
      agentMap.set(ownerId, {
        id: u.id, name: u.name, role: u.role, manager_id: u.manager_id,
        production: 0, collection: 0, total: 0, details: [],
      });
    }
    const agent = agentMap.get(ownerId)!;
    const isNew = p.installment.is_first;
    if (isNew) agent.production += Number(p.amount);
    else        agent.collection += Number(p.amount);
    agent.total += Number(p.amount);
    agent.details.push({
      customerName:      p.installment.policy.customer.name,
      policyNumber:      p.installment.policy.policy_number,
      installmentNumber: p.installment.installment_number,
      type:              isNew ? 'new' : 'collection',
      amount:            Number(p.amount),
      paidAt:            p.paid_at,
    });
  }

  // 5. بناء هيكل الهرم حسب الـ role
  const supervisorList: SupervisorSummary[] = [];
  const directAgentList: AgentSummary[]     = [];

  const childrenOf = new Map<string, string[]>();
  for (const u of usersMap.values()) {
    if (!u.manager_id) continue;
    if (!childrenOf.has(u.manager_id)) childrenOf.set(u.manager_id, []);
    childrenOf.get(u.manager_id)!.push(u.id);
  }

  const getAgentsUnder = (managerId: string): AgentSummary[] => {
    const result: AgentSummary[] = [];
    const children = childrenOf.get(managerId) || [];
    for (const cid of children) {
      const cu = usersMap.get(cid);
      if (!cu) continue;
      if (getRoleLevel(cu.role) >= 6) {
        if (agentMap.has(cid)) result.push(agentMap.get(cid)!);
        else result.push({ id: cu.id, name: cu.name, role: cu.role, manager_id: cu.manager_id, production: 0, collection: 0, total: 0, details: [] });
      } else {
        result.push(...getAgentsUnder(cid));
      }
    }
    return result;
  };

  const buildGroup = (leaderId: string): GroupSummary => {
    const leader = usersMap.get(leaderId)!;
    const agents = getAgentsUnder(leaderId);
    const prod = agents.reduce((s, a) => s + a.production, 0);
    const coll = agents.reduce((s, a) => s + a.collection, 0);
    return { leaderId, leaderName: leader.name, leaderRole: leader.role, production: prod, collection: coll, total: prod + coll, agents };
  };

  const buildSupervisor = (supId: string): SupervisorSummary => {
    const sup = usersMap.get(supId)!;
    const children = childrenOf.get(supId) || [];
    const groups: GroupSummary[] = [];
    const directA: AgentSummary[] = [];

    for (const cid of children) {
      const cu = usersMap.get(cid);
      if (!cu) continue;
      if (getRoleLevel(cu.role) === 5) {
        groups.push(buildGroup(cid));
      } else if (getRoleLevel(cu.role) >= 6) {
        if (agentMap.has(cid)) directA.push(agentMap.get(cid)!);
        else directA.push({ id: cu.id, name: cu.name, role: cu.role, manager_id: cu.manager_id, production: 0, collection: 0, total: 0, details: [] });
      }
    }

    if (directA.length > 0) {
      groups.push({
        leaderId: supId + '_direct', leaderName: 'وكلاء مباشرون',
        leaderRole: 'agent' as UserRole,
        production: directA.reduce((s, a) => s + a.production, 0),
        collection: directA.reduce((s, a) => s + a.collection, 0),
        total: directA.reduce((s, a) => s + a.total, 0),
        agents: directA,
      });
    }

    const prod = groups.reduce((s, g) => s + g.production, 0);
    const coll = groups.reduce((s, g) => s + g.collection, 0);
    return { supervisorId: supId, supervisorName: sup.name, supervisorRole: sup.role, production: prod, collection: coll, total: prod + coll, groups };
  };

  const myChildren = childrenOf.get(user.id) || [];
  const myDirectGroups: GroupSummary[] = [];
  for (const cid of myChildren) {
    const cu = usersMap.get(cid);
    if (!cu) continue;
    const lvl = getRoleLevel(cu.role);
    if (lvl <= 4) {
      supervisorList.push(buildSupervisor(cid));
    } else if (lvl === 5) {
      myDirectGroups.push(buildGroup(cid));
    } else {
      if (agentMap.has(cid)) directAgentList.push(agentMap.get(cid)!);
      else directAgentList.push({ id: cu.id, name: cu.name, role: cu.role, manager_id: cu.manager_id, production: 0, collection: 0, total: 0, details: [] });
    }
  }

  if (myDirectGroups.length > 0) {
    supervisorList.unshift({
      supervisorId: user.id,
      supervisorName: user.name,
      supervisorRole: user.role,
      production: myDirectGroups.reduce((s, g) => s + g.production, 0),
      collection: myDirectGroups.reduce((s, g) => s + g.collection, 0),
      total: myDirectGroups.reduce((s, g) => s + g.total, 0),
      groups: myDirectGroups,
    });
  }

  const totalProd = supervisorList.reduce((s, sv) => s + sv.production, 0)
                  + directAgentList.reduce((s, a) => s + a.production, 0);
  const totalColl = supervisorList.reduce((s, sv) => s + sv.collection, 0)
                  + directAgentList.reduce((s, a) => s + a.collection, 0);

  // ── بيانات التقرير المطبوع (هيكل إداري بحت) ──
  const isSupervisorPrinter = user.role === 'supervisor';

  const getAgentIdsUnder = (managerId: string): string[] => {
    const result: string[] = [];
    const kids = childrenOf.get(managerId) || [];
    for (const kid of kids) {
      const ku = usersMap.get(kid);
      if (!ku) continue;
      if (getRoleLevel(ku.role) >= 6) result.push(kid);
      else result.push(...getAgentIdsUnder(kid));
    }
    return result;
  };

  const sumAgentIds = (idsToSum: string[]) => {
    let production = 0, collection = 0, total = 0;
    for (const id of idsToSum) {
      const a = agentMap.get(id);
      if (a) { production += a.production; collection += a.collection; total += a.total; }
    }
    return { production, collection, total };
  };

  const buildGroupLeaderAgg = (glId: string): GroupLeaderAgg => {
    const gl = usersMap.get(glId)!;
    return { id: glId, name: gl.name, ...sumAgentIds(getAgentIdsUnder(glId)) };
  };

  const buildSupervisorAgg = (supId: string, nameOverride?: string): SupervisorAgg => {
    const sup = usersMap.get(supId);
    const kids = childrenOf.get(supId) || [];
    const groupLeaders: GroupLeaderAgg[] = [];
    const directAgentIds: string[] = [];

    for (const kid of kids) {
      const ku = usersMap.get(kid);
      if (!ku) continue;
      if (ku.role === 'group_leader') {
        groupLeaders.push(buildGroupLeaderAgg(kid));
      } else if (getRoleLevel(ku.role) >= 6) {
        directAgentIds.push(kid);
      }
    }
    if (directAgentIds.length > 0) {
      groupLeaders.push({ id: supId + '_direct', name: 'وكلاء مباشرون', ...sumAgentIds(directAgentIds) });
    }
    const totals = groupLeaders.reduce((acc, g) => ({
      production: acc.production + g.production,
      collection: acc.collection + g.collection,
      total: acc.total + g.total,
    }), { production: 0, collection: 0, total: 0 });

    return { id: supId, name: nameOverride ?? sup?.name ?? '', groupLeaders, ...totals };
  };

  const printSupervisorList: SupervisorAgg[] = [];

  if (isSupervisorPrinter) {
    printSupervisorList.push(buildSupervisorAgg(user.id, user.name));
  } else {
    const kids = childrenOf.get(user.id) || [];
    const directGroupLeaderIds: string[] = [];
    const directAgentIds: string[] = [];

    for (const kid of kids) {
      const ku = usersMap.get(kid);
      if (!ku) continue;
      if (ku.role === 'supervisor') {
        printSupervisorList.push(buildSupervisorAgg(kid));
      } else if (ku.role === 'group_leader') {
        directGroupLeaderIds.push(kid);
      } else if (getRoleLevel(ku.role) >= 6) {
        directAgentIds.push(kid);
      }
    }

    if (directGroupLeaderIds.length > 0 || directAgentIds.length > 0) {
      const groupLeaders: GroupLeaderAgg[] = directGroupLeaderIds.map(buildGroupLeaderAgg);
      if (directAgentIds.length > 0) {
        groupLeaders.push({ id: user.id + '_direct', name: 'وكلاء مباشرون', ...sumAgentIds(directAgentIds) });
      }
      const totals = groupLeaders.reduce((acc, g) => ({
        production: acc.production + g.production,
        collection: acc.collection + g.collection,
        total: acc.total + g.total,
      }), { production: 0, collection: 0, total: 0 });
      printSupervisorList.push({ id: user.id, name: user.name, groupLeaders, ...totals });
    }
  }

  // ── تفاصيل العمليات المسددة — قائمة مسطّحة ──
  const resolveHierarchyNames = (agentId: string) => {
    const agent = usersMap.get(agentId);
    const agentName = agent?.name || '';

    if (isSupervisorPrinter) {
      let groupLeaderName = 'وكلاء مباشرون';
      let cur = agent?.manager_id;
      while (cur && cur !== user.id) {
        const m = usersMap.get(cur);
        if (!m) break;
        if (m.role === 'group_leader') { groupLeaderName = m.name; break; }
        cur = m.manager_id;
      }
      return { supervisorName: user.name, groupLeaderName, agentName };
    }

    let groupLeaderName = '';
    let supervisorName = '';
    let cur = agent?.manager_id;
    while (cur) {
      const m = usersMap.get(cur);
      if (!m) break;
      if (!groupLeaderName && m.role === 'group_leader') groupLeaderName = m.name;
      if (!supervisorName && m.role === 'supervisor') supervisorName = m.name;
      if (cur === user.id) break;
      cur = m.manager_id;
    }
    if (!supervisorName) supervisorName = user.name;
    if (!groupLeaderName) groupLeaderName = 'وكلاء مباشرون';
    return { supervisorName, groupLeaderName, agentName };
  };

  const detailRows: PrintDetailRow[] = payments.map((p) => {
    const ownerId = p.installment.policy.owner_id;
    const { supervisorName, groupLeaderName, agentName } = resolveHierarchyNames(ownerId);
    return {
      supervisorName,
      groupLeaderName,
      agentName,
      customerName: p.installment.policy.customer.name,
      policyNumber: p.installment.policy.policy_number,
      installmentNumber: p.installment.installment_number,
      amount: Number(p.amount),
      type: p.installment.is_first ? 'new' : 'collection',
    };
  });

  detailRows.sort((a, b) =>
    a.supervisorName.localeCompare(b.supervisorName, 'ar') ||
    a.groupLeaderName.localeCompare(b.groupLeaderName, 'ar') ||
    a.agentName.localeCompare(b.agentName, 'ar') ||
    a.customerName.localeCompare(b.customerName, 'ar')
  );

  return {
    supervisors: supervisorList,
    directAgents: directAgentList,
    grandProduction: totalProd,
    grandCollection: totalColl,
    printSupervisors: printSupervisorList,
    printDetailRows: detailRows,
  };
}
