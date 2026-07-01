import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase, ROLE_LABELS, getRoleLevel, canCloseMonth, type UserRole } from '../lib/supabase';
import {
  Lock, Unlock, CheckCircle, AlertCircle,
  ChevronLeft, ChevronRight, TrendingUp,
  Users, FileText, ChevronDown, ChevronUp,
  Printer
} from 'lucide-react';
import clsx from 'clsx';
import { format, startOfMonth, subMonths, addMonths, isSameMonth, endOfMonth } from 'date-fns';
import { ar } from 'date-fns/locale';

// ─── types ────────────────────────────────────────────────
interface PaymentRow {
  id: string;
  amount: number;
  paid_at: string;
  installment: {
    installment_number: number;
    is_first: boolean;
    policy: {
      policy_number: string;
      owner_id: string;
      customer: { name: string };
    };
  };
}

interface AgentSummary {
  id: string;
  name: string;
  role: UserRole;
  manager_id: string | null;
  production: number;
  collection: number;
  total: number;
  details: {
    customerName: string;
    policyNumber: string;
    installmentNumber: number;
    type: 'new' | 'collection';
    amount: number;
    paidAt: string;
  }[];
}

interface GroupSummary {
  leaderId: string;
  leaderName: string;
  leaderRole: UserRole;
  production: number;
  collection: number;
  total: number;
  agents: AgentSummary[];
}

interface SupervisorSummary {
  supervisorId: string;
  supervisorName: string;
  supervisorRole: UserRole;
  production: number;
  collection: number;
  total: number;
  groups: GroupSummary[];
}

interface GroupLeaderAgg {
  id: string;
  name: string;
  production: number;
  collection: number;
  total: number;
}

interface SupervisorAgg {
  id: string;
  name: string;
  groupLeaders: GroupLeaderAgg[];
  production: number;
  collection: number;
  total: number;
}

interface PrintDetailRow {
  supervisorName: string;
  groupLeaderName: string;
  agentName: string;
  customerName: string;
  policyNumber: string;
  installmentNumber: number;
  amount: number;
  type: 'new' | 'collection';
}

// ─── helpers ─────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0 }).format(n);

// آخر 6 أرقام فقط من رقم الوثيقة
const last6 = (policyNumber: string) => {
  const digits = (policyNumber || '').toString();
  return digits.length > 6 ? digits.slice(-6) : digits;
};

// ─── component ────────────────────────────────────────────
export function MonthlyClosing() {
  const { user } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);

  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(new Date()));
  const [loading, setLoading]             = useState(true);
  const [processing, setProcessing]       = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'close' | 'open'>('close');

  // report data
  const [isClosed, setIsClosed]           = useState(false);
  const [closingRecord, setClosingRecord] = useState<any>(null);
  const [grandProduction, setGrandProduction] = useState(0);
  const [grandCollection, setGrandCollection] = useState(0);
  const [supervisors, setSupervisors]     = useState<SupervisorSummary[]>([]);
  const [directAgents, setDirectAgents]   = useState<AgentSummary[]>([]);
  const [printSupervisors, setPrintSupervisors] = useState<SupervisorAgg[]>([]);
  const [printDetailRows, setPrintDetailRows]   = useState<PrintDetailRow[]>([]);

  // UI expand state
  const [expandedSupervisors, setExpandedSupervisors] = useState<Set<string>>(new Set());
  const [expandedGroups, setExpandedGroups]           = useState<Set<string>>(new Set());
  const [expandedAgents, setExpandedAgents]           = useState<Set<string>>(new Set());

  const canClose = user && canCloseMonth(user.role);

  useEffect(() => { if (user && canClose) loadData(); }, [user, selectedMonth]);

  // ── load ──────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true);
    try {
      const monthStr  = format(selectedMonth, 'yyyy-MM-dd');
      const monthEnd  = format(endOfMonth(selectedMonth), 'yyyy-MM-dd');

      // 1. حالة التقفيل
      const { data: closingData } = await supabase
        .from('monthly_closings')
        .select('*, closed_by:closed_by_user_id(name), opened_by:opened_by_user_id(name)')
        .eq('month', monthStr)
        .maybeSingle();

      setIsClosed(!!closingData && !closingData.is_open);
      setClosingRecord(closingData);

      // 2. كل المستخدمين تحت المستخدم الحالي
      const { data: subtreeIds } = await supabase.rpc('get_user_subtree', { user_id: user!.id });
      const ids: string[] = subtreeIds || [user!.id];

      const { data: usersData } = await supabase
        .from('users')
        .select('id, name, role, manager_id')
        .in('id', ids);

      const usersMap = new Map<string, { id: string; name: string; role: UserRole; manager_id: string | null }>(
        (usersData || []).map((u: any) => [u.id, u])
      );

      // 3. كل المدفوعات الفعلية للشهر (غير ملغاة)
      const { data: paymentsRaw } = await supabase
        .from('payments')
        .select(`
          id, amount, paid_at,
          installment:installment_id (
            installment_number, is_first,
            policy:policy_id (
              policy_number, owner_id,
              customer:customer_id ( name )
            )
          )
        `)
        .eq('payment_month', monthStr)
        .eq('is_cancelled', false);

      const payments: PaymentRow[] = (paymentsRaw || []).filter(
        (p: any) => ids.includes(p.installment?.policy?.owner_id)
      ) as PaymentRow[];

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
      // نفصّل: supervisors (level 3-4) → group_leaders (5) → agents (6)
      // أو مباشرة: agents تحت المستخدم الحالي
      const supervisorList: SupervisorSummary[] = [];
      const directAgentList: AgentSummary[]     = [];

      // نبني شجرة: لكل واحد manager_id → children
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
            // وكيل مباشر
            if (agentMap.has(cid)) result.push(agentMap.get(cid)!);
            else result.push({ id: cu.id, name: cu.name, role: cu.role, manager_id: cu.manager_id, production: 0, collection: 0, total: 0, details: [] });
          } else {
            // تقسيم فرعي — نضمّ وكلاءه
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
            // group_leader
            groups.push(buildGroup(cid));
          } else if (getRoleLevel(cu.role) >= 6) {
            // وكيل مباشر تحت المراقب
            if (agentMap.has(cid)) directA.push(agentMap.get(cid)!);
            else directA.push({ id: cu.id, name: cu.name, role: cu.role, manager_id: cu.manager_id, production: 0, collection: 0, total: 0, details: [] });
          }
        }

        // نضيف الوكلاء المباشرين كـ group وهمية
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

      // أطفال المستخدم الحالي المباشرون
      const myChildren = childrenOf.get(user!.id) || [];
      const myDirectGroups: GroupSummary[] = [];
      for (const cid of myChildren) {
        const cu = usersMap.get(cid);
        if (!cu) continue;
        const lvl = getRoleLevel(cu.role);
        if (lvl <= 4) {
          supervisorList.push(buildSupervisor(cid));
        } else if (lvl === 5) {
          // group_leader مباشر تحتي — يُجمع تحت اسمي أنا (المراقب الحالي)، مش كأنه مراقب منفصل
          myDirectGroups.push(buildGroup(cid));
        } else {
          // وكيل مباشر
          if (agentMap.has(cid)) directAgentList.push(agentMap.get(cid)!);
          else directAgentList.push({ id: cu.id, name: cu.name, role: cu.role, manager_id: cu.manager_id, production: 0, collection: 0, total: 0, details: [] });
        }
      }

      // كل قادة المجموعات المباشرين تحتي يظهروا في جدول واحد باسمي أنا (المراقب الحقيقي)
      if (myDirectGroups.length > 0) {
        supervisorList.unshift({
          supervisorId: user!.id,
          supervisorName: user!.name,
          supervisorRole: user!.role,
          production: myDirectGroups.reduce((s, g) => s + g.production, 0),
          collection: myDirectGroups.reduce((s, g) => s + g.collection, 0),
          total: myDirectGroups.reduce((s, g) => s + g.total, 0),
          groups: myDirectGroups,
        });
      }

      // الإجمالي الكلي
      const totalProd = supervisorList.reduce((s, sv) => s + sv.production, 0)
                      + directAgentList.reduce((s, a) => s + a.production, 0);
      const totalColl = supervisorList.reduce((s, sv) => s + sv.collection, 0)
                      + directAgentList.reduce((s, a) => s + a.collection, 0);

      setGrandProduction(totalProd);
      setGrandCollection(totalColl);
      setSupervisors(supervisorList);
      setDirectAgents(directAgentList);

      // ── بناء بيانات التقرير المطبوع الجديد (هيكل إداري بحت) ──
      // كل الأدوار الأعلى من "مراقب" (مراقب عام / مدير تطوير / مدير النظام)
      // تُعامل كـ "مراقب عام" وتعرض كل المراقبين التابعين لها.
      const isSupervisorPrinter = user!.role === 'supervisor';

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
        // حالة "مراقب": هو نفسه رأس الشجرة، وتحته رؤساء المجموعات مباشرة
        printSupervisorList.push(buildSupervisorAgg(user!.id, user!.name));
      } else {
        // حالة "مراقب عام" (أو أعلى): كل المراقبين التابعين له، كل مع رؤساء مجموعاته
        const kids = childrenOf.get(user!.id) || [];
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

        // أي رؤساء مجموعات أو وكلاء تابعين مباشرة للمراقب العام (بدون مراقب بينهم)
        // تُجمع تحت اسم المراقب العام نفسه كصف "مراقب" إضافي
        if (directGroupLeaderIds.length > 0 || directAgentIds.length > 0) {
          const groupLeaders: GroupLeaderAgg[] = directGroupLeaderIds.map(buildGroupLeaderAgg);
          if (directAgentIds.length > 0) {
            groupLeaders.push({ id: user!.id + '_direct', name: 'وكلاء مباشرون', ...sumAgentIds(directAgentIds) });
          }
          const totals = groupLeaders.reduce((acc, g) => ({
            production: acc.production + g.production,
            collection: acc.collection + g.collection,
            total: acc.total + g.total,
          }), { production: 0, collection: 0, total: 0 });
          printSupervisorList.push({ id: user!.id, name: user!.name, groupLeaders, ...totals });
        }
      }

      setPrintSupervisors(printSupervisorList);

      // ── تفاصيل العمليات المسددة (صفحة 2 وما بعدها) — قائمة مسطّحة ──
      const resolveHierarchyNames = (agentId: string) => {
        const agent = usersMap.get(agentId);
        const agentName = agent?.name || '';

        if (isSupervisorPrinter) {
          let groupLeaderName = 'وكلاء مباشرون';
          let cur = agent?.manager_id;
          while (cur && cur !== user!.id) {
            const m = usersMap.get(cur);
            if (!m) break;
            if (m.role === 'group_leader') { groupLeaderName = m.name; break; }
            cur = m.manager_id;
          }
          return { supervisorName: user!.name, groupLeaderName, agentName };
        }

        let groupLeaderName = '';
        let supervisorName = '';
        let cur = agent?.manager_id;
        while (cur) {
          const m = usersMap.get(cur);
          if (!m) break;
          if (!groupLeaderName && m.role === 'group_leader') groupLeaderName = m.name;
          if (!supervisorName && m.role === 'supervisor') supervisorName = m.name;
          if (cur === user!.id) break;
          cur = m.manager_id;
        }
        if (!supervisorName) supervisorName = user!.name;
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

      setPrintDetailRows(detailRows);

    } catch (err) {
      console.error('Error loading monthly closing data:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── toggle / close / open ──────────────────────────────
  const toggleSupervisor = (id: string) =>
    setExpandedSupervisors(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleGroup = (id: string) =>
    setExpandedGroups(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const toggleAgent = (id: string) =>
    setExpandedAgents(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const handleConfirmAction = async () => {
    if (!user || !canClose) return;
    setProcessing(true);
    try {
      const monthStr = format(selectedMonth, 'yyyy-MM-dd');
      if (confirmAction === 'close') {
        const { error } = await supabase.from('monthly_closings').insert({
          month: monthStr, closed_by_user_id: user.id, is_open: false,
        });
        if (error?.code === '23505') {
          await supabase.from('monthly_closings')
            .update({ is_open: false, opened_at: null, opened_by_user_id: null })
            .eq('month', monthStr);
        } else if (error) throw error;
        await supabase.rpc('log_activity', { p_action: 'month_close', p_entity_type: 'monthly_closing' });
      } else {
        const { error } = await supabase.from('monthly_closings')
          .update({ is_open: true, opened_at: new Date().toISOString(), opened_by_user_id: user.id })
          .eq('month', monthStr);
        if (error) throw error;
        await supabase.rpc('log_activity', { p_action: 'month_open', p_entity_type: 'monthly_closing' });
      }
      setShowConfirmModal(false);
      loadData();
    } catch (err) {
      console.error(err);
      alert('حدث خطأ أثناء العملية');
    } finally {
      setProcessing(false);
    }
  };

  const handlePrint = () => window.print();

  const isCurrentMonth = isSameMonth(selectedMonth, new Date());
  const grandTotal     = grandProduction + grandCollection;
  const monthLabel     = format(selectedMonth, 'MMMM yyyy', { locale: ar });

  if (!canClose) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <Lock className="w-16 h-16 text-secondary-300 mb-4" />
        <p className="text-secondary-500">ليس لديك صلاحية للوصول لهذه الصفحة</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn" ref={printRef}>

      {/* ── Header ── */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-secondary-900">تقرير تقفيل الشهر</h2>
          <p className="text-sm text-secondary-500 mt-1">مراجعة الإنتاج الفعلي المسدّد قبل اعتماد الشهر</p>
        </div>
        <button onClick={handlePrint} className="btn btn-ghost text-secondary-600 print:hidden">
          <Printer className="w-4 h-4" />
          <span>طباعة التقرير</span>
        </button>
      </div>

      {/* ── Month Navigator ── */}
      <div className="card print:hidden">
        <div className="flex items-center justify-between">
          <button onClick={() => setSelectedMonth(m => subMonths(m, 1))} className="btn btn-ghost">
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-secondary-900">{monthLabel}</h3>
            <div className="flex items-center justify-center gap-2 mt-1">
              {isClosed ? (
                <span className="badge badge-success flex items-center gap-1">
                  <Lock className="w-3 h-3" /> مُقفَّل ومعتمد
                </span>
              ) : (
                <span className="badge badge-warning flex items-center gap-1">
                  <Unlock className="w-3 h-3" /> مفتوح — قيد المراجعة
                </span>
              )}
            </div>
          </div>
          <button onClick={() => setSelectedMonth(m => addMonths(m, 1))} disabled={isCurrentMonth} className="btn btn-ghost disabled:opacity-50">
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
        </div>
      ) : (
        <>
          {/* ── Totals ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 print:hidden">
            <div className="card bg-success-50 border border-success-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-success-100 flex items-center justify-center flex-shrink-0">
                  <TrendingUp className="w-5 h-5 text-success-600" />
                </div>
                <div>
                  <p className="text-xs text-secondary-500">الإنتاج الجديد</p>
                  <p className="text-lg font-bold text-success-700">{fmt(grandProduction)}</p>
                </div>
              </div>
            </div>
            <div className="card bg-info-50 border border-info-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-info-100 flex items-center justify-center flex-shrink-0">
                  <FileText className="w-5 h-5 text-info-600" />
                </div>
                <div>
                  <p className="text-xs text-secondary-500">التحصيل الدوري</p>
                  <p className="text-lg font-bold text-info-700">{fmt(grandCollection)}</p>
                </div>
              </div>
            </div>
            <div className="card bg-primary-50 border border-primary-200">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-primary-100 flex items-center justify-center flex-shrink-0">
                  <Users className="w-5 h-5 text-primary-600" />
                </div>
                <div>
                  <p className="text-xs text-secondary-500">الإجمالي الكلي</p>
                  <p className="text-lg font-bold text-primary-700">{fmt(grandTotal)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* ── Supervisors Tree ── */}
          <div className="space-y-3 print:hidden">

            {supervisors.map((sv) => (
              <div key={sv.supervisorId} className="card p-0 overflow-hidden">

                {/* Supervisor row */}
                <button
                  onClick={() => toggleSupervisor(sv.supervisorId)}
                  className="w-full flex items-center justify-between p-4 hover:bg-secondary-50 transition-colors text-right"
                >
                  <div className="flex items-center gap-3">
                    <div className={clsx(
                      'w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0',
                      'bg-warning-100 text-warning-700'
                    )}>
                      {sv.supervisorName.charAt(0)}
                    </div>
                    <div>
                      <p className="font-semibold text-secondary-900">{sv.supervisorName}</p>
                      <p className="text-xs text-secondary-500">{ROLE_LABELS[sv.supervisorRole]}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-6">
                    <div className="text-left hidden sm:block">
                      <p className="text-xs text-secondary-400">إنتاج</p>
                      <p className="text-sm font-medium text-success-600">{fmt(sv.production)}</p>
                    </div>
                    <div className="text-left hidden sm:block">
                      <p className="text-xs text-secondary-400">تحصيل</p>
                      <p className="text-sm font-medium text-info-600">{fmt(sv.collection)}</p>
                    </div>
                    <div className="text-left">
                      <p className="text-xs text-secondary-400">الإجمالي</p>
                      <p className="text-sm font-bold text-primary-700">{fmt(sv.total)}</p>
                    </div>
                    {expandedSupervisors.has(sv.supervisorId)
                      ? <ChevronUp className="w-4 h-4 text-secondary-400 flex-shrink-0" />
                      : <ChevronDown className="w-4 h-4 text-secondary-400 flex-shrink-0" />}
                  </div>
                </button>

                {/* Groups */}
                {expandedSupervisors.has(sv.supervisorId) && (
                  <div className="border-t border-secondary-100">
                    {sv.groups.map((grp) => (
                      <div key={grp.leaderId}>

                        {/* Group row */}
                        <button
                          onClick={() => toggleGroup(grp.leaderId)}
                          className="w-full flex items-center justify-between px-6 py-3 hover:bg-secondary-50 transition-colors text-right border-b border-secondary-50"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-bold flex-shrink-0">
                              {grp.leaderName.charAt(0)}
                            </div>
                            <div>
                              <p className="text-sm font-medium text-secondary-800">{grp.leaderName}</p>
                              <p className="text-xs text-secondary-400">{ROLE_LABELS[grp.leaderRole] ?? 'مجموعة'} · {grp.agents.length} وكيل</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <span className="text-xs text-success-600 hidden sm:block">{fmt(grp.production)}</span>
                            <span className="text-xs text-info-600 hidden sm:block">{fmt(grp.collection)}</span>
                            <span className="text-sm font-semibold text-primary-700">{fmt(grp.total)}</span>
                            {expandedGroups.has(grp.leaderId)
                              ? <ChevronUp className="w-3 h-3 text-secondary-400" />
                              : <ChevronDown className="w-3 h-3 text-secondary-400" />}
                          </div>
                        </button>

                        {/* Agents */}
                        {expandedGroups.has(grp.leaderId) && (
                          <div className="bg-secondary-50">
                            {grp.agents.map((agent) => (
                              <AgentRow
                                key={agent.id}
                                agent={agent}
                                expanded={expandedAgents.has(agent.id)}
                                onToggle={() => toggleAgent(agent.id)}
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}

            {/* Direct agents under current user */}
            {directAgents.length > 0 && (
              <div className="card p-0 overflow-hidden">
                <div className="px-4 py-3 bg-secondary-50 border-b border-secondary-200">
                  <p className="text-sm font-medium text-secondary-600">وكلاء مباشرون</p>
                </div>
                {directAgents.map((agent) => (
                  <AgentRow
                    key={agent.id}
                    agent={agent}
                    expanded={expandedAgents.has(agent.id)}
                    onToggle={() => toggleAgent(agent.id)}
                  />
                ))}
              </div>
            )}

            {supervisors.length === 0 && directAgents.length === 0 && (
              <div className="card text-center py-12">
                <FileText className="w-12 h-12 text-secondary-300 mx-auto mb-3" />
                <p className="text-secondary-500">لا توجد مدفوعات مسجّلة لهذا الشهر</p>
              </div>
            )}
          </div>

          {/* ── Close / Open actions ── */}
          <div className="card print:hidden">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
              <div>
                {isClosed ? (
                  <div className="flex items-center gap-2 text-success-700">
                    <CheckCircle className="w-5 h-5" />
                    <div>
                      <p className="font-medium">الشهر مُقفَّل ومعتمد</p>
                      {closingRecord && (
                        <p className="text-xs text-secondary-500 mt-0.5">
                          بواسطة: {(closingRecord as any).closed_by?.name} ·{' '}
                          {format(new Date(closingRecord.closed_at), 'dd/MM/yyyy HH:mm')}
                        </p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start gap-2 text-warning-700">
                    <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium">الشهر لم يُقفَّل بعد</p>
                      <p className="text-xs text-secondary-500 mt-0.5">
                        راجع الأرقام أعلاه ثم اضغط تقفيل للاعتماد النهائي
                      </p>
                    </div>
                  </div>
                )}
              </div>

              <div className="flex gap-3 print:hidden">
                {isClosed ? (
                  <button
                    onClick={() => { setConfirmAction('open'); setShowConfirmModal(true); }}
                    className="btn btn-warning"
                    disabled={
                      closingRecord?.closed_by_user_id !== user?.id &&
                      user?.role !== 'super_admin' && user?.role !== 'development_manager'
                    }
                  >
                    <Unlock className="w-4 h-4" />
                    <span>فتح الشهر</span>
                  </button>
                ) : (
                  <button
                    onClick={() => { setConfirmAction('close'); setShowConfirmModal(true); }}
                    className="btn btn-primary"
                  >
                    <Lock className="w-4 h-4" />
                    <span>تقفيل واعتماد الشهر</span>
                  </button>
                )}
              </div>
            </div>
          </div>
          {/* ── Structured Print Report (visible only when printing) ── */}
          <PrintReport
            supervisorName={user?.name || ''}
            supervisorRoleLabel={ROLE_LABELS[user?.role ?? 'supervisor']}
            monthLabel={monthLabel}
            closingDate={closingRecord?.closed_at ? format(new Date(closingRecord.closed_at), 'dd/MM/yyyy') : format(new Date(), 'dd/MM/yyyy')}
            printSupervisors={printSupervisors}
            printDetailRows={printDetailRows}
            grandProduction={grandProduction}
            grandCollection={grandCollection}
            grandTotal={grandTotal}
          />
        </>
      )}

      {/* ── Confirm Modal ── */}
      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div className="modal-content max-w-sm animate-fadeIn" onClick={e => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className={clsx(
                'w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4',
                confirmAction === 'close' ? 'bg-primary-100' : 'bg-warning-100'
              )}>
                {confirmAction === 'close'
                  ? <Lock className="w-6 h-6 text-primary-600" />
                  : <Unlock className="w-6 h-6 text-warning-600" />}
              </div>
              <h3 className="text-lg font-semibold text-secondary-900 mb-2">
                {confirmAction === 'close' ? 'تأكيد التقفيل والاعتماد' : 'تأكيد فتح الشهر'}
              </h3>
              <p className="text-secondary-600 mb-2">
                {confirmAction === 'close'
                  ? `هل أنت متأكد من تقفيل شهر ${monthLabel} باعتبار الأرقام المعروضة نهائية؟`
                  : `هل أنت متأكد من فتح شهر ${monthLabel}؟`}
              </p>
              {confirmAction === 'close' && (
                <div className="text-sm bg-secondary-50 rounded-lg p-3 mb-4 text-right">
                  <p className="text-secondary-600">إجمالي الإنتاج: <span className="font-bold text-success-600">{fmt(grandProduction)}</span></p>
                  <p className="text-secondary-600">إجمالي التحصيل: <span className="font-bold text-info-600">{fmt(grandCollection)}</span></p>
                  <p className="text-secondary-700 font-semibold">الإجمالي الكلي: <span className="text-primary-700">{fmt(grandTotal)}</span></p>
                </div>
              )}
              {confirmAction === 'close' && (
                <p className="text-xs text-warning-600 mb-4">
                  بعد التقفيل لن يتمكن أي مستخدم من إضافة أو إلغاء مدفوعات لهذا الشهر.
                </p>
              )}
              <div className="flex justify-center gap-3">
                <button onClick={() => setShowConfirmModal(false)} className="btn btn-secondary">إلغاء</button>
                <button
                  onClick={handleConfirmAction}
                  disabled={processing}
                  className={clsx('btn', confirmAction === 'close' ? 'btn-primary' : 'btn-warning')}
                >
                  {processing
                    ? <><div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" /><span>جاري...</span></>
                    : <span>{confirmAction === 'close' ? 'تقفيل واعتماد' : 'فتح الشهر'}</span>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Print Report (structured, print-only) ────────────────
// يظهر فقط عند الطباعة — صفحة تجميعات أولى (هيكل إداري بحت) ثم صفحات تفاصيل العمليات المسددة
function PrintReport({
  supervisorName, supervisorRoleLabel, monthLabel, closingDate,
  printSupervisors, printDetailRows,
  grandProduction, grandCollection, grandTotal,
}: {
  supervisorName: string;
  supervisorRoleLabel: string;
  monthLabel: string;
  closingDate: string;
  printSupervisors: SupervisorAgg[];
  printDetailRows: PrintDetailRow[];
  grandProduction: number;
  grandCollection: number;
  grandTotal: number;
}) {
  return (
    <div className="hidden print:block print-report" dir="rtl">
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm 12mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .print-report { font-family: 'Tahoma', 'Arial', sans-serif; color: #111; font-size: 12px; }
        .print-report .pr-page-break { page-break-before: always; break-before: page; }
        .print-report table { width: 100%; border-collapse: collapse; }
        .print-report th, .print-report td { border: 1px solid #999; padding: 4px 6px; text-align: center; }
        .print-report th { background: #e8e8e8; font-weight: 700; }
        .print-report .pr-title { text-align: center; font-size: 18px; font-weight: 800; margin-bottom: 2px; }
        .print-report .pr-sub { text-align: center; font-size: 12px; color: #444; margin-bottom: 14px; }
        .print-report .pr-meta { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 10px; border-bottom: 2px solid #333; padding-bottom: 6px; }
        .print-report .pr-sup-name { font-weight: 800; font-size: 13px; }
        .print-report .pr-group-row td:first-child { text-align: right; font-weight: 700; }
        .print-report .pr-totals-row td { font-weight: 800; background: #f6f6f6; }
        .print-report .pr-grand-box { border: 2px solid #333; padding: 10px 14px; margin-top: 16px; }
        .print-report .pr-grand-box .row { display:flex; justify-content: space-between; padding: 3px 0; font-size: 13px; }
        .print-report .pr-grand-box .row.total { font-weight: 800; font-size: 15px; border-top: 1px solid #999; margin-top: 4px; padding-top: 6px; }

        /* جدول التفاصيل: عنوان التقرير ورأس الجدول يتكرران تلقائياً في كل صفحة مطبوعة */
        .print-report .pr-detail-table thead { display: table-header-group; }
        .print-report .pr-detail-table tfoot { display: table-footer-group; }
        .print-report .pr-detail-table tr { page-break-inside: avoid; }
        .print-report .pr-detail-title-row th { background: #fff; border: none; padding: 0 0 4px; }
        .print-report .pr-detail-title-row .pr-title { margin-bottom: 0; }
        .print-report .pr-detail-meta-row th { background: #fff; border: none; border-bottom: 2px solid #333; padding: 0 0 8px; }
        .print-report .pr-detail-meta-row .pr-meta { margin-bottom: 0; border-bottom: none; padding-bottom: 0; }
      `}</style>

      {/* ══ صفحة 1: التجميعات (هيكل إداري بحت — بدون تفاصيل عملاء) ══ */}
      <div className="pr-title">تقرير تقفيل الشهر</div>
      <div className="pr-sub">صفحة التجميعات</div>
      <div className="pr-meta">
        <span><b>{supervisorRoleLabel}:</b> {supervisorName}</span>
        <span><b>الشهر:</b> {monthLabel}</span>
        <span><b>تاريخ التقفيل:</b> {closingDate}</span>
      </div>

      {printSupervisors.map((sv) => (
        <div key={sv.id} style={{ marginBottom: 10 }}>
          <div className="pr-sup-name" style={{ margin: '8px 0 4px' }}>
            {ROLE_LABELS['supervisor']}: {sv.name}
          </div>
          <table>
            <thead>
              <tr>
                <th style={{ width: '32%' }}>رئيس المجموعة</th>
                <th>إجمالي الجديد</th>
                <th>إجمالي التحصيل</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {sv.groupLeaders.map((gl) => (
                <tr key={gl.id} className="pr-group-row">
                  <td>{gl.name}</td>
                  <td>{fmt(gl.production)}</td>
                  <td>{fmt(gl.collection)}</td>
                  <td>{fmt(gl.total)}</td>
                </tr>
              ))}
              {sv.groupLeaders.length === 0 && (
                <tr><td colSpan={4}>لا توجد مجموعات لهذا المراقب</td></tr>
              )}
              <tr className="pr-totals-row">
                <td>إجمالي {sv.name}</td>
                <td>{fmt(sv.production)}</td>
                <td>{fmt(sv.collection)}</td>
                <td>{fmt(sv.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}

      {printSupervisors.length === 0 && (
        <p style={{ textAlign: 'center', margin: '20px 0' }}>لا توجد بيانات لهذا الشهر</p>
      )}

      <div className="pr-grand-box">
        <div className="row"><span>إجمالي {supervisorRoleLabel} — الإنتاج الجديد</span><span>{fmt(grandProduction)}</span></div>
        <div className="row"><span>إجمالي {supervisorRoleLabel} — التحصيل</span><span>{fmt(grandCollection)}</span></div>
        <div className="row total"><span>إجمالي {supervisorRoleLabel} — الإجمالي الكلي</span><span>{fmt(grandTotal)}</span></div>
      </div>

      {/* ══ الصفحة الثانية وما بعدها: كل عمليات السداد خلال الشهر — جدول واحد مسطّح ══ */}
      <div className="pr-page-break">
        <table className="pr-detail-table">
          <thead>
            <tr className="pr-detail-title-row">
              <th colSpan={8}>
                <div className="pr-title">تقرير تقفيل الشهر</div>
              </th>
            </tr>
            <tr className="pr-detail-meta-row">
              <th colSpan={8}>
                <div className="pr-meta">
                  <span><b>{supervisorRoleLabel}:</b> {supervisorName}</span>
                  <span><b>الشهر:</b> {monthLabel}</span>
                  <span><b>تفاصيل عمليات السداد</b></span>
                </div>
              </th>
            </tr>
            <tr>
              <th>المراقب</th>
              <th>رئيس المجموعة</th>
              <th>الوكيل</th>
              <th>العميل</th>
              <th>آخر 6 أرقام الوثيقة</th>
              <th>رقم القسط</th>
              <th>قيمة القسط</th>
              <th>نوع العملية</th>
            </tr>
          </thead>
          <tbody>
            {printDetailRows.map((r, i) => (
              <tr key={i}>
                <td>{r.supervisorName}</td>
                <td>{r.groupLeaderName}</td>
                <td>{r.agentName}</td>
                <td style={{ textAlign: 'right' }}>{r.customerName}</td>
                <td dir="ltr">{last6(r.policyNumber)}</td>
                <td>{r.installmentNumber}</td>
                <td>{fmt(r.amount)}</td>
                <td>{r.type === 'new' ? 'جديد' : 'تحصيل'}</td>
              </tr>
            ))}
            {printDetailRows.length === 0 && (
              <tr><td colSpan={8}>لا توجد عمليات سداد مسجّلة لهذا الشهر</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="pr-totals-row">
              <td colSpan={6}>الإجمالي الكلي لعمليات السداد</td>
              <td colSpan={2}>{fmt(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
    </div>
  );
}
function AgentRow({ agent, expanded, onToggle }: {
  agent: AgentSummary;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-secondary-100 last:border-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-2.5 hover:bg-secondary-100 transition-colors text-right"
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-secondary-200 text-secondary-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
            {agent.name.charAt(0)}
          </div>
          <div>
            <p className="text-sm text-secondary-800">{agent.name}</p>
            <p className="text-xs text-secondary-400">{ROLE_LABELS[agent.role]} · {agent.details.length} عملية</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-success-600 hidden sm:block">{fmt(agent.production)}</span>
          <span className="text-xs text-info-600 hidden sm:block">{fmt(agent.collection)}</span>
          <span className="text-sm font-semibold text-secondary-800">{fmt(agent.total)}</span>
          {expanded
            ? <ChevronUp className="w-3 h-3 text-secondary-400" />
            : <ChevronDown className="w-3 h-3 text-secondary-400" />}
        </div>
      </button>

      {expanded && agent.details.length > 0 && (
        <div className="px-6 pb-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-secondary-400 border-b border-secondary-100">
                <th className="text-right py-1.5 font-medium">العميل</th>
                <th className="text-right py-1.5 font-medium">رقم الوثيقة</th>
                <th className="text-right py-1.5 font-medium">رقم القسط</th>
                <th className="text-right py-1.5 font-medium">النوع</th>
                <th className="text-left py-1.5 font-medium">القيمة</th>
                <th className="text-left py-1.5 font-medium">تاريخ السداد</th>
              </tr>
            </thead>
            <tbody>
              {agent.details
                .sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime())
                .map((d, i) => (
                  <tr key={i} className="border-b border-secondary-50 hover:bg-white transition-colors">
                    <td className="py-1.5 text-secondary-700">{d.customerName}</td>
                    <td className="py-1.5 text-secondary-600 font-mono" dir="ltr">{d.policyNumber}</td>
                    <td className="py-1.5 text-secondary-600 text-center">{d.installmentNumber}</td>
                    <td className="py-1.5">
                      <span className={clsx(
                        'badge text-xs',
                        d.type === 'new' ? 'badge-success' : 'badge-info'
                      )}>
                        {d.type === 'new' ? 'جديد' : 'تحصيل'}
                      </span>
                    </td>
                    <td className="py-1.5 text-left font-medium text-secondary-800">{fmt(d.amount)}</td>
                    <td className="py-1.5 text-left text-secondary-500" dir="ltr">
                      {format(new Date(d.paidAt), 'dd/MM/yyyy')}
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-secondary-200">
                <td colSpan={4} className="py-1.5 text-secondary-500 font-medium">الإجمالي</td>
                <td className="py-1.5 text-left font-bold text-primary-700">{fmt(agent.total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {expanded && agent.details.length === 0 && (
        <p className="px-6 pb-3 text-xs text-secondary-400">لا توجد مدفوعات لهذا الوكيل في هذا الشهر</p>
      )}
    </div>
  );
}
