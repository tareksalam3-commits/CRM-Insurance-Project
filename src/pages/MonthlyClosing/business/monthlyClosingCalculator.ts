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
    // لو رئيس المجموعة نفسه مالك وثائق (باع/حصّل بنفسه)، بياناته الشخصية
    // موجودة في agentMap. بنضيفها كصف مستقل باسم "إنتاج شخصي" ضمن قائمة
    // الوكلاء اللي بتظهر لما توسّع الصف، عشان تبان لوحدها وتتحسب فى الإجمالي بردو.
    const ownEntry = agentMap.get(leaderId);
    const finalAgents = ownEntry ? [...agents, { ...ownEntry, id: leaderId + '_own', name: 'إنتاج شخصي' }] : agents;
    const prod = finalAgents.reduce((s, a) => s + a.production, 0);
    const coll = finalAgents.reduce((s, a) => s + a.collection, 0);
    return { leaderId, leaderName: leader.name, leaderRole: leader.role, production: prod, collection: coll, total: prod + coll, agents: finalAgents, agentCount: agents.length };
  };

  const buildSupervisor = (supId: string): SupervisorSummary => {
    const sup = usersMap.get(supId)!;
    const children = childrenOf.get(supId) || [];
    const groups: GroupSummary[] = [];
    const directA: AgentSummary[] = [];

    for (const cid of children) {
      const cu = usersMap.get(cid);
      if (!cu) continue;
      const lvl = getRoleLevel(cu.role);
      if (lvl === 5) {
        groups.push(buildGroup(cid));
      } else if (lvl >= 6) {
        if (agentMap.has(cid)) directA.push(agentMap.get(cid)!);
        else directA.push({ id: cu.id, name: cu.name, role: cu.role, manager_id: cu.manager_id, production: 0, collection: 0, total: 0, details: [] });
      } else {
        // مستوى إداري متداخل فوق رئيس المجموعة (مراقب تحت مراقب عام، مراقب عام
        // تحت مدير تطوير... إلخ) — كان بيتفقد بالكامل قبل كده. بنبنيه بنفس منطق
        // المراقب (بما فيه رقمه الشخصي) وبندمج مجموعاته هنا عشان الأرقام تتجمع
        // هرميًا مهما زاد عدد المستويات الإدارية بين المستخدم الحالي والوكلاء.
        const nested = buildSupervisor(cid);
        groups.push(...nested.groups);
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
        agentCount: directA.length,
      });
    }

    // لو المراقب نفسه مالك وثائق (باع/حصّل بنفسه)، بياناته الشخصية موجودة في
    // agentMap. بنضيفها كصف مستقل باسم "إنتاج شخصي" تحت المراقب (بدل ما تندمج
    // في الإجمالي من غير ما تظهر)، عشان تبان لوحدها فى الشاشة وتتحسب فى الإجمالي بردو.
    const supOwn = agentMap.get(supId);
    if (supOwn) {
      groups.push({
        leaderId: supId + '_own',
        leaderName: 'إنتاج شخصي',
        leaderRole: sup.role,
        production: supOwn.production,
        collection: supOwn.collection,
        total: supOwn.total,
        agents: [supOwn],
        agentCount: 0,
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

  // لو المستخدم الحالي (لما يفتح هو نفسه صفحة إقفال الشهر، مش حد فوقه بيشوف
  // فريقه) عنده وثائق باعها/حصّلها بنفسه، بياناته الشخصية موجودة في agentMap.
  // بنضيفها كصف مستقل باسم "إنتاج شخصي" بدل ما تندمج في الإجمالي من غير ما تظهر.
  const myOwn = agentMap.get(user.id);
  if (myOwn) {
    myDirectGroups.push({
      leaderId: user.id + '_own',
      leaderName: 'إنتاج شخصي',
      leaderRole: user.role,
      production: myOwn.production,
      collection: myOwn.collection,
      total: myOwn.total,
      agents: [myOwn],
      agentCount: 0,
    });
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

  const buildGroupLeaderAgg = (glId: string): GroupLeaderAgg[] => {
    const gl = usersMap.get(glId)!;
    const ids = getAgentIdsUnder(glId);
    const agentsSum = sumAgentIds(ids);
    // بيانات رئيس المجموعة الشخصية لو باع/حصّل بنفسه بتتحسب ضمن صفه هو
    // مباشرة (بدون صف تفصيلي مستقل) — لأن صفحة التجميعات صفحة إجمالي فقط.
    const own = agentMap.get(glId);
    const production = agentsSum.production + (own?.production ?? 0);
    const collection = agentsSum.collection + (own?.collection ?? 0);
    const total = agentsSum.total + (own?.total ?? 0);
    return [{ id: glId, name: gl.name, production, collection, total }];
  };

  const buildSupervisorAgg = (supId: string, nameOverride?: string): SupervisorAgg => {
    const sup = usersMap.get(supId);
    const kids = childrenOf.get(supId) || [];
    const groupLeaders: GroupLeaderAgg[] = [];
    const directAgentIds: string[] = [];

    for (const kid of kids) {
      const ku = usersMap.get(kid);
      if (!ku) continue;
      const lvl = getRoleLevel(ku.role);
      if (ku.role === 'group_leader') {
        groupLeaders.push(...buildGroupLeaderAgg(kid));
      } else if (lvl >= 6) {
        directAgentIds.push(kid);
      } else {
        // مستوى إداري متداخل (نفس الفكرة اللي فوق) — بندمج مجموعات رؤساء المجموعات
        // بتاعته هنا عشان التقرير المطبوع يتطابق مع المعروض على الشاشة.
        const nested = buildSupervisorAgg(kid);
        groupLeaders.push(...nested.groupLeaders);
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

    // بيانات المراقب الشخصية لو باع/حصّل بنفسه بتتحسب فى الإجمالي مباشرة
    // (بدون صف تفصيلي مستقل باسم "إنتاج شخصي") — صفحة التجميعات صفحة
    // إجمالي فقط بدون تفاصيل.
    const supOwn = agentMap.get(supId);
    if (supOwn) {
      totals.production += supOwn.production;
      totals.collection += supOwn.collection;
      totals.total += supOwn.total;
    }

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
      const lvl = getRoleLevel(ku.role);
      if (lvl <= 4) {
        // أي مستوى إداري من "مراقب" فما فوق (مراقب، مراقب عام، مدير تطوير، مدير
        // نظام) — كان بيتلقط الدور "supervisor" حرفيًا بس، فكانت المستويات
        // الإدارية الأعلى بتتفقد بالكامل من التقرير.
        printSupervisorList.push(buildSupervisorAgg(kid));
      } else if (ku.role === 'group_leader') {
        directGroupLeaderIds.push(kid);
      } else if (lvl >= 6) {
        directAgentIds.push(kid);
      }
    }

    if (directGroupLeaderIds.length > 0 || directAgentIds.length > 0 || agentMap.has(user.id)) {
      const groupLeaders: GroupLeaderAgg[] = directGroupLeaderIds.flatMap(buildGroupLeaderAgg);
      if (directAgentIds.length > 0) {
        groupLeaders.push({ id: user.id + '_direct', name: 'وكلاء مباشرون', ...sumAgentIds(directAgentIds) });
      }
      const totals = groupLeaders.reduce((acc, g) => ({
        production: acc.production + g.production,
        collection: acc.collection + g.collection,
        total: acc.total + g.total,
      }), { production: 0, collection: 0, total: 0 });
      // بيانات المستخدم الحالي الشخصية لو باع/حصّل بنفسه بتتحسب فى الإجمالي
      // مباشرة (بدون صف تفصيلي مستقل) — صفحة التجميعات صفحة إجمالي فقط.
      const myOwn = agentMap.get(user.id);
      if (myOwn) {
        totals.production += myOwn.production;
        totals.collection += myOwn.collection;
        totals.total += myOwn.total;
      }
      printSupervisorList.push({ id: user.id, name: user.name, groupLeaders, ...totals });
    }
  }

  // ── تفاصيل العمليات المسددة — قائمة مسطّحة ──
  const PERSONAL_PRODUCTION_LABEL = 'إنتاج شخصي';

  const resolveHierarchyNames = (agentId: string) => {
    const agent = usersMap.get(agentId);
    const agentName = agent?.name || '';
    const ownerLevel = agent ? getRoleLevel(agent.role) : 6;

    if (isSupervisorPrinter) {
      // صاحب الإنتاج نفسه رئيس مجموعة (إنتاج شخصي) — اسمه يتحط فى عموده
      // الوظيفي الحقيقي "رئيس المجموعة"، وعمود "الوكيل" يتكتب فيه
      // "إنتاج شخصي" بدل تكرار اسمه فيه.
      if (agent?.role === 'group_leader') {
        return { supervisorName: user.name, groupLeaderName: agentName, agentName: PERSONAL_PRODUCTION_LABEL };
      }
      // صاحب الإنتاج نفسه مراقب (اللي بيطبع التقرير) وباع/حصّل بنفسه —
      // اسمه أصلاً فى عمود المراقب، والعمودين التاليين "إنتاج شخصي".
      if (ownerLevel <= 4) {
        return { supervisorName: agentName, groupLeaderName: PERSONAL_PRODUCTION_LABEL, agentName: PERSONAL_PRODUCTION_LABEL };
      }

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

    // صاحب الإنتاج نفسه رئيس مجموعة (إنتاج شخصي) فى تقرير مستخدم أعلى منه —
    // نفس الفكرة: اسمه فى عمود "رئيس المجموعة"، وعمود "الوكيل" = "إنتاج شخصي".
    if (agent?.role === 'group_leader') {
      let supervisorName = '';
      let cur = agent.manager_id;
      while (cur) {
        const m = usersMap.get(cur);
        if (!m) break;
        if (!supervisorName && getRoleLevel(m.role) <= 4) supervisorName = m.name;
        if (cur === user.id) break;
        cur = m.manager_id;
      }
      if (!supervisorName) supervisorName = user.name;
      return { supervisorName, groupLeaderName: agentName, agentName: PERSONAL_PRODUCTION_LABEL };
    }

    // صاحب الإنتاج نفسه مراقب (أو مستوى إدارى أعلى) — اسمه فى عمود
    // المراقب، والعمودين التاليين "إنتاج شخصي".
    if (ownerLevel <= 4) {
      return { supervisorName: agentName, groupLeaderName: PERSONAL_PRODUCTION_LABEL, agentName: PERSONAL_PRODUCTION_LABEL };
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
