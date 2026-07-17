import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { ROLE_LABELS, canCloseMonth, canViewMonthlyClosing } from '../../lib/supabase';
import {
  Lock, Unlock, CheckCircle, AlertCircle,
  ChevronLeft, ChevronRight, TrendingUp,
  Users, FileText, ChevronDown, ChevronUp,
  Printer
} from 'lucide-react';
import clsx from 'clsx';
import { format, startOfMonth, subMonths, addMonths, isSameMonth } from 'date-fns';
import { ar } from 'date-fns/locale';

import type { AgentSummary, SupervisorSummary, SupervisorAgg, PrintDetailRow } from './types';
import { fmt } from './utils';
import { AgentRow } from './components/AgentRow';
import { PrintReport } from './components/PrintReport';
import {
  fetchClosingRecord, fetchUserSubtreeIds, fetchUsersByIds,
  fetchMonthPayments, filterPaymentsByOwnerIds, closeMonth, openMonth,
} from './services/monthlyClosingService';
import { buildMonthlyClosingSummary } from './business/monthlyClosingCalculator';

// ─── component ────────────────────────────────────────────
export function MonthlyClosing() {
  const { user } = useAuth();
  const printRef = useRef<HTMLDivElement>(null);

  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(new Date()));
  const [loading, setLoading]             = useState(true);
  // بيبقى true بعد أول تحميل ناجح — بيفرّق بين "أول فتح للصفحة" (يستحق
  // شاشة تحميل كاملة) و"تغيير الشهر" بعد كده (يحافظ على آخر تقرير ظاهر
  // مع مؤشر تحديث بسيط بدل ما تختفي الشاشة بالكامل فى كل مرة)
  const [hasLoadedOnce, setHasLoadedOnce] = useState(false);
  const isInitialLoading = loading && !hasLoadedOnce;
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

  // عرض الصفحة نفسها: أي مدير من Group Leader فما فوق (نطاقه الإداري فقط)
  const canView = user && canViewMonthlyClosing(user.role);
  // تنفيذ تقفيل/فتح الشهر (عملية تخص النظام كله): Supervisor فما فوق فقط
  const canClose = user && canCloseMonth(user.role);

  useEffect(() => { if (user && canView) loadData(); }, [user, selectedMonth]);

  // ── load ──────────────────────────────────────────────
  const loadData = async () => {
    setLoading(true);
    try {
      const monthStr = format(selectedMonth, 'yyyy-MM-dd');

      // 1. حالة التقفيل
      const closingData = await fetchClosingRecord(monthStr);
      setIsClosed(!!closingData && !closingData.is_open);
      setClosingRecord(closingData);

      // 2. كل المستخدمين تحت المستخدم الحالي
      const ids = await fetchUserSubtreeIds(user!.id);
      const usersData = await fetchUsersByIds(ids);

      // 3. كل المدفوعات الفعلية للشهر (غير ملغاة)
      const paymentsRaw = await fetchMonthPayments(monthStr);
      const payments = filterPaymentsByOwnerIds(paymentsRaw, ids);

      // 4-5. التجميع وبناء الهرم وبيانات التقرير المطبوع
      const summary = buildMonthlyClosingSummary(
        { id: user!.id, name: user!.name, role: user!.role },
        usersData,
        payments,
      );

      setGrandProduction(summary.grandProduction);
      setGrandCollection(summary.grandCollection);
      setSupervisors(summary.supervisors);
      setDirectAgents(summary.directAgents);
      setPrintSupervisors(summary.printSupervisors);
      setPrintDetailRows(summary.printDetailRows);

    } catch (err) {
      console.error('Error loading monthly closing data:', err);
    } finally {
      setLoading(false);
      setHasLoadedOnce(true);
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
        await closeMonth(monthStr, user.id);
      } else {
        await openMonth(monthStr, user.id);
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

  if (!canView) {
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
          <h2 className="text-xl font-bold text-secondary-900">إقفال الشهر</h2>
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
            <h3 className="text-lg font-semibold text-secondary-900 flex items-center justify-center gap-2">
              <span>{monthLabel}</span>
              {loading && !isInitialLoading && (
                <span className="w-3 h-3 rounded-full border-2 border-secondary-300 border-t-primary-500 animate-spin" />
              )}
            </h3>
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

      {isInitialLoading ? (
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

          {/* ── Close / Open status + actions ── */}
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

              {canClose && (
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
              )}
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
