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

// ─── helpers ─────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0 }).format(n);

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
      for (const cid of myChildren) {
        const cu = usersMap.get(cid);
        if (!cu) continue;
        const lvl = getRoleLevel(cu.role);
        if (lvl <= 4) {
          supervisorList.push(buildSupervisor(cid));
        } else if (lvl === 5) {
          // group_leader مباشر تحتي
          const g = buildGroup(cid);
          supervisorList.push({
            supervisorId: cid, supervisorName: cu.name, supervisorRole: cu.role,
            production: g.production, collection: g.collection, total: g.total,
            groups: [g],
          });
        } else {
          // وكيل مباشر
          if (agentMap.has(cid)) directAgentList.push(agentMap.get(cid)!);
          else directAgentList.push({ id: cu.id, name: cu.name, role: cu.role, manager_id: cu.manager_id, production: 0, collection: 0, total: 0, details: [] });
        }
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
      <div className="card">
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
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
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
          <div className="space-y-3">

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
          <div className="card">
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

// ─── Agent Row Sub-component ──────────────────────────────
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
