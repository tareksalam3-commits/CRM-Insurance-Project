import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useBranchContext } from '../../lib/branchContext';
import { useReconnectRefetch } from '../../hooks/useReconnectRefetch';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import clsx from 'clsx';
import {
  Printer, Users, FileText, TrendingUp, Wallet, AlertTriangle,
  UserCheck, Users2, ShieldCheck, XCircle, RefreshCw, Layers,
} from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import { ar } from 'date-fns/locale';

import { PageHeader } from '../../components/layout/PageHeader';
import { ROLE_LABELS } from '../../lib/supabase';
import type { ReportType, DateRange } from './types';
import {
  fetchUserSubtreeIds, fetchCustomersInRange, fetchPoliciesForOwners, fetchPaymentsInRange,
  fetchAllInstallmentsWithPolicy, fetchAgentsForReport, fetchSimplePaymentsInRange,
  fetchUsersByRole, fetchLeadersPerformance, fetchInstallmentsDueInRange, fetchUsersInSubtree,
} from './services/reportsService';
import {
  fetchActivityTargets, fetchDailyStatsForUsers,
} from './services/activityTargetsService';
import type { ActivityTargets } from './business/performanceScoreCalculator';
import {
  formatCurrency, computeCustomersReport, computePoliciesReport, computeProductionReport,
  computeCollectionReport, computeOverdueReport, computeAgentsReport,
  computeTeamPerformanceReport, computeCancellationsReport,
} from './business/reportsCalculator';
import { loadCancellationSummary } from '../Cancellations/services/cancellationService';
import { ActivityTargetsPanel } from './components/ActivityTargetsPanel';

export function Reports() {
  const { user } = useAuth();
  const { currentBranchId } = useBranchContext();
  const navigate = useNavigate();
  const [reportType, setReportType] = useState<ReportType>('collection');
  const [dateRange, setDateRange] = useState<DateRange>('month');
  const currentYear = new Date().getFullYear();
  // فلتر الشهر: بصيغة yyyy-MM، يُستخدم فقط عندما تكون dateRange = 'month'
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  // فلتر الربع السنوي: رقم الربع (1-4) والسنة — يختارهما المستخدم بحرية
  // بدل الاعتماد دائماً على آخر 3 أشهر من تاريخ اليوم
  const [selectedQuarter, setSelectedQuarter] = useState<number>(Math.floor(new Date().getMonth() / 3) + 1);
  const [quarterYear, setQuarterYear] = useState<number>(currentYear);
  // فلتر السنة: يختارها المستخدم بحرية بدل تثبيتها على السنة الحالية دائماً
  const [selectedYear, setSelectedYear] = useState<number>(currentYear);
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  // فلتر الحالة (مسدد/غير مسدد) لتقرير التحصيل الدوري وإجمالي الإنتاج
  // والتحصيل — بيتحكم بس فى عرض جدول التفاصيل المطبوع (مش فى إجماليات
  // الملخص اللي فوق، اللي بتفضل بتعرض أرقام الفترة كاملة)
  const [statusFilter, setStatusFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  // فلتر "اختيار مستخدم معين": فاضي = نطاقي أنا كامل (زي الافتراضي القديم).
  // لو اتحدد مستخدم، التقرير بيتحسب على أساس هو وكل اللي تحته فى الهيكل
  // الوظيفي فقط (حسب get_user_subtree)، بدل نطاقي أنا
  const [selectedUserId, setSelectedUserId] = useState<string>('');
  const [selectableUsers, setSelectableUsers] = useState<{ id: string; name: string; role: string }[]>([]);
  // الأهداف اليومية المستخدمة لحساب "التقييم الشامل" (درجة النشاط) — تُحمّل
  // مرة واحدة، وتُستخدم فى تبويبات أداء الوكلاء/رؤساء المجموعات/المراقبين
  const [activityTargets, setActivityTargets] = useState<(ActivityTargets & { id: string | null }) | null>(null);
  // أول تحميل فقط (لسه مفيش بيانات لأي تقرير) يستحق شاشة تحميل كاملة —
  // تبديل نوع التقرير أو الفلتر بعد كده يحافظ على آخر تقرير ظاهر مع
  // مؤشر تحديث بسيط بدل ما تختفي الشاشة بالكامل فى كل مرة
  const isInitialLoading = loading && data === null;

  useEffect(() => {
    if (user) {
      loadReport();
    }
  }, [user, reportType, dateRange, selectedMonth, selectedQuarter, quarterYear, selectedYear, selectedUserId, currentBranchId, activityTargets]);

  useReconnectRefetch(() => { if (user) loadReport(); });

  // قائمة المستخدمين القابلين للاختيار فى فلتر "مستخدم معين" — كل اللي تحت
  // نطاق المستخدم الحالي فى الهيكل الوظيفي (بما فيهم هو نفسه)، تُحمّل مرة
  // واحدة لما المستخدم يفتح الصفحة
  useEffect(() => {
    if (!user) return;
    (async () => {
      const baseIds = await fetchUserSubtreeIds(user.id, currentBranchId);
      const list = await fetchUsersInSubtree(baseIds);
      setSelectableUsers(list);
    })();
  }, [user, currentBranchId]);

  useEffect(() => {
    (async () => {
      const targets = await fetchActivityTargets();
      setActivityTargets(targets);
    })();
  }, []);

  const getDateRange = () => {
    const now = new Date();
    switch (dateRange) {
      case 'month': {
        // استخدام الشهر المُختار من الفلتر بدل الاعتماد دائماً على الشهر الحالي
        const base = selectedMonth ? new Date(`${selectedMonth}-01T00:00:00`) : now;
        return { start: startOfMonth(base), end: endOfMonth(base) };
      }
      case 'quarter': {
        // الربع المختار (1: يناير-مارس ... 4: أكتوبر-ديسمبر) من السنة المختارة
        const startMonth = (selectedQuarter - 1) * 3;
        const start = new Date(quarterYear, startMonth, 1);
        const end = endOfMonth(new Date(quarterYear, startMonth + 2, 1));
        return { start, end };
      }
      case 'year': {
        const yearDate = new Date(selectedYear, 0, 1);
        return { start: startOfYear(yearDate), end: endOfYear(yearDate) };
      }
      default:
        return { start: startOfMonth(now), end: endOfMonth(now) };
    }
  };

  const loadReport = async () => {
    setLoading(true);
    try {
      const { start, end } = getDateRange();

      // تقرير "نسبة الإلغاءات" لا يحتاج مطلقًا شجرة المستخدمين الفرعية (يعتمد
      // فقط على loadCancellationSummary) — تفادي استعلام RPC غير مستخدم له
      if (reportType === 'cancellations') {
        await loadCancellationsReport();
        return;
      }

      const baseUserIds = await fetchUserSubtreeIds(user!.id, currentBranchId);
      // لو محدد مستخدم معين فى الفلتر: النطاق يبقى هو وكل اللي تحته بس
      // (مقصور دايماً على نطاق المستخدم الحالي الأصلي كحماية إضافية)
      const userIds = selectedUserId
        ? (await fetchUserSubtreeIds(selectedUserId, currentBranchId)).filter((id) => baseUserIds.includes(id))
        : baseUserIds;

      switch (reportType) {
        case 'customers':
          await loadCustomersReport(userIds, start, end);
          break;
        case 'policies':
          await loadPoliciesReport(userIds);
          break;
        case 'production':
          await loadProductionReport(userIds, start, end);
          break;
        case 'collection':
          await loadCollectionReport(userIds, start, end);
          break;
        case 'production_collection':
          await loadProductionAndCollectionReport(userIds, start, end);
          break;
        case 'overdue':
          await loadOverdueReport(userIds);
          break;
        case 'agents':
          await loadAgentsReport(userIds, start, end);
          break;
        case 'group_leaders':
          await loadGroupLeadersReport(userIds, start, end);
          break;
        case 'supervisors':
          await loadSupervisorsReport(userIds, start, end);
          break;
      }
    } catch (error) {
      console.error('Error loading report:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomersReport = async (userIds: string[], start: Date, end: Date) => {
    const customers = await fetchCustomersInRange(userIds, start, end);
    const { data: reportData, chartData: chart } = computeCustomersReport(customers);
    setData(reportData);
    setChartData(chart);
  };

  const loadPoliciesReport = async (userIds: string[]) => {
    const policies = await fetchPoliciesForOwners(userIds);
    const { data: reportData, chartData: chart } = computePoliciesReport(policies);
    setData(reportData);
    setChartData(chart);
  };

  const loadProductionReport = async (userIds: string[], start: Date, end: Date) => {
    const payments = await fetchPaymentsInRange(start, end);
    const { data: reportData, chartData: chart } = computeProductionReport(payments, userIds);
    setData(reportData);
    setChartData(chart);
  };

  const loadCollectionReport = async (userIds: string[], start: Date, end: Date) => {
    const [payments, installmentsDue] = await Promise.all([
      fetchPaymentsInRange(start, end),
      fetchInstallmentsDueInRange(userIds, start, end),
    ]);
    const { data: reportData, chartData: chart } = computeCollectionReport(payments, installmentsDue, userIds);
    setData(reportData);
    setChartData(chart);
  };

  const loadProductionAndCollectionReport = async (userIds: string[], start: Date, end: Date) => {
    const [payments, installmentsDue] = await Promise.all([
      fetchPaymentsInRange(start, end),
      fetchInstallmentsDueInRange(userIds, start, end, true),
    ]);
    // includeFirstInstallments=true: مستحق ومسدد واحد مجمّع (إنتاج جديد +
    // تحصيل دوري معاً) بدل تقسيمهما لبندين منفصلين
    const { data: reportData, chartData: chart } = computeCollectionReport(payments, installmentsDue, userIds, true);
    setData(reportData);
    setChartData(chart);
  };

  const loadOverdueReport = async (userIds: string[]) => {
    const installments = await fetchAllInstallmentsWithPolicy();
    const { data: reportData, chartData: chart } = computeOverdueReport(installments, userIds);
    setData(reportData);
    setChartData(chart);
  };

  const loadAgentsReport = async (userIds: string[], start: Date, end: Date) => {
    // الثلاثة مستقلون (لا يعتمد أي منهم على نتيجة الآخر) — تنفيذهم بالتوازي
    // بدل التسلسل يقلّل زمن التحميل دون أي تغيير فى النتيجة
    const [agents, payments, dailyStats] = await Promise.all([
      fetchAgentsForReport(userIds),
      fetchSimplePaymentsInRange(start, end),
      fetchDailyStatsForUsers(userIds, start, end),
    ]);
    const dailyStatsByAgent = new Map<string, typeof dailyStats>();
    dailyStats.forEach((row) => {
      if (!dailyStatsByAgent.has(row.agent_id)) dailyStatsByAgent.set(row.agent_id, []);
      dailyStatsByAgent.get(row.agent_id)!.push(row);
    });
    const { data: reportData, chartData: chart } = computeAgentsReport(
      agents, payments, dailyStatsByAgent, activityTargets ?? undefined,
    );
    setData(reportData);
    setChartData(chart);
  };

  const loadGroupLeadersReport = async (userIds: string[], start: Date, end: Date) => {
    const leaders = await fetchUsersByRole(userIds, ['group_leader']);
    const performance = await fetchLeadersPerformance(leaders, start, end, currentBranchId, activityTargets ?? undefined);
    const { details } = computeTeamPerformanceReport(performance, 'رئيس المجموعة');

    setData({ leaders: performance, details });
    setChartData(performance.map((p) => ({ name: p.name, value: p.finalScore })));
  };

  // تقرير "نسبة الإلغاءات" له فترة حساب ثابتة دائماً (أول يناير حتى نهاية
  // الشهر الحالي)، مستقلة عن فلاتر الفترة الخاصة بباقي التقارير
  const loadCancellationsReport = async () => {
    if (!user) return;
    const summary = await loadCancellationSummary({ id: user.id, name: user.name, role: user.role });
    const { data: reportData, chartData: chart } = computeCancellationsReport(summary);
    setData(reportData);
    setChartData(chart);
  };

  const loadSupervisorsReport = async (userIds: string[], start: Date, end: Date) => {
    const supervisors = await fetchUsersByRole(userIds, ['supervisor', 'general_supervisor']);
    const performance = await fetchLeadersPerformance(supervisors, start, end, currentBranchId, activityTargets ?? undefined);
    const { details } = computeTeamPerformanceReport(performance, 'المراقب');

    setData({ supervisors: performance, details });
    setChartData(performance.map((p) => ({ name: p.name, value: p.finalScore })));
  };

  const mainReportButtons: { id: ReportType; label: string; icon: typeof Users }[] = [
    { id: 'customers', label: 'تقرير العملاء', icon: Users },
    { id: 'policies', label: 'تقرير الوثائق', icon: FileText },
    { id: 'production', label: 'الإنتاج الجديد', icon: TrendingUp },
    { id: 'collection', label: 'التحصيل الدوري', icon: Wallet },
    { id: 'production_collection', label: 'إجمالي الإنتاج والتحصيل', icon: Layers },
    { id: 'overdue', label: 'الأقساط المتأخرة', icon: AlertTriangle },
  ];

  const performanceReportButtons: { id: ReportType; label: string; icon: typeof Users }[] = [
    { id: 'agents', label: 'أداء الوكلاء', icon: UserCheck },
    { id: 'group_leaders', label: 'أداء رؤساء المجموعات', icon: Users2 },
    { id: 'supervisors', label: 'أداء المراقبين', icon: ShieldCheck },
  ];

  const cancellationsReportButtons: { id: ReportType; label: string; icon: typeof Users }[] = [
    { id: 'cancellations', label: 'نسبة الإلغاءات', icon: XCircle },
  ];

  const reportButtons = [...mainReportButtons, ...performanceReportButtons, ...cancellationsReportButtons];

  // قائمة السنوات المتاحة للاختيار (5 سنوات سابقة + السنة القادمة)
  const yearOptions = Array.from({ length: 7 }, (_, i) => currentYear + 1 - i);

  const { start: periodStart, end: periodEnd } = getDateRange();
  const currentReportLabel = reportButtons.find((r) => r.id === reportType)?.label;
  const detailsColumns = data?.details && data.details.length > 0 ? Object.keys(data.details[0]) : [];

  return (
    <div className="print-report space-y-6 animate-fadeIn print:space-y-3">
      {/* رأس خاص بالطباعة فقط - لا يظهر أثناء الاستخدام العادى */}
      <div className="hidden print:block text-center mb-4">
        <h1 className="text-xl font-bold">{currentReportLabel}</h1>
        <p className="text-sm text-secondary-600 mt-1">
          الفترة من {format(periodStart, 'd MMMM yyyy', { locale: ar })} إلى{' '}
          {format(periodEnd, 'd MMMM yyyy', { locale: ar })}
        </p>
        <p className="text-xs text-secondary-400 mt-1">
          تاريخ الطباعة: {format(new Date(), 'd MMMM yyyy - HH:mm', { locale: ar })}
        </p>
      </div>

      <div className="print:hidden">
        <PageHeader
          title="مؤشرات الأداء والإحصائيات"
          subtitle="تقارير أداء الوكلاء ورؤساء المجموعات والمراقبين"
          action={
            <div className="flex items-center gap-2">
              <button
                onClick={() => window.print()}
                className="btn btn-secondary"
                title="طباعة التقرير"
              >
                <Printer className="w-4 h-4" />
                <span>طباعة</span>
              </button>
            </div>
          }
        />
        {loading && !isInitialLoading && (
          <p className="flex items-center gap-1.5 text-secondary-400 text-xs mt-1.5">
            <RefreshCw className="w-3 h-3 animate-spin" />
            جارِ التحديث...
          </p>
        )}
      </div>

      <div className="card print:hidden space-y-4">
        <ReportButtonGroup
          title="التقارير"
          buttons={mainReportButtons}
          reportType={reportType}
          onSelect={setReportType}
        />
        <div className="border-t border-secondary-100 pt-4">
          <ReportButtonGroup
            title="تقارير الأداء"
            buttons={performanceReportButtons}
            reportType={reportType}
            onSelect={setReportType}
          />
        </div>
        <div className="border-t border-secondary-100 pt-4">
          <ReportButtonGroup
            title="نسبة الإلغاءات"
            buttons={cancellationsReportButtons}
            reportType={reportType}
            onSelect={setReportType}
          />
        </div>
      </div>

      {(reportType === 'agents' || reportType === 'group_leaders' || reportType === 'supervisors') && (
        <ActivityTargetsPanel targets={activityTargets} onSaved={setActivityTargets} />
      )}

      {reportType === 'cancellations' ? (
        <p className="text-sm text-secondary-500 print:hidden">
          فترة الحساب ثابتة دائماً: من أول يناير حتى نهاية الشهر الحالي من سنة {new Date().getFullYear()}
        </p>
      ) : (
        <div className="card print:hidden">
          <label className="input-label">الفترة</label>
          <div className="flex flex-wrap gap-2 mt-1">
            <select
              value={dateRange}
              onChange={(e) => setDateRange(e.target.value as DateRange)}
              className="input-field w-auto"
            >
              <option value="month">شهر محدد</option>
              <option value="quarter">ربع سنوي محدد</option>
              <option value="year">سنة محددة</option>
            </select>

            {dateRange === 'month' && (
              <input
                type="month"
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="input-field w-auto"
              />
            )}

            {dateRange === 'quarter' && (
              <>
                <select
                  value={selectedQuarter}
                  onChange={(e) => setSelectedQuarter(Number(e.target.value))}
                  className="input-field w-auto"
                >
                  <option value={1}>الربع الأول (يناير - مارس)</option>
                  <option value={2}>الربع الثاني (أبريل - يونيو)</option>
                  <option value={3}>الربع الثالث (يوليو - سبتمبر)</option>
                  <option value={4}>الربع الرابع (أكتوبر - ديسمبر)</option>
                </select>
                <select
                  value={quarterYear}
                  onChange={(e) => setQuarterYear(Number(e.target.value))}
                  className="input-field w-auto"
                >
                  {yearOptions.map((y) => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </>
            )}

            {dateRange === 'year' && (
              <select
                value={selectedYear}
                onChange={(e) => setSelectedYear(Number(e.target.value))}
                className="input-field w-auto"
              >
                {yearOptions.map((y) => (
                  <option key={y} value={y}>{y}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      {(reportType === 'collection' || reportType === 'production_collection') && (
        <div className="card print:hidden">
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="input-label">الحالة قبل الطباعة</label>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as 'all' | 'paid' | 'unpaid')}
                className="input-field w-auto mt-1"
              >
                <option value="all">الكل (مسدد وغير مسدد)</option>
                <option value="paid">مسدد فقط</option>
                <option value="unpaid">غير مسدد فقط</option>
              </select>
            </div>
            <div>
              <label className="input-label">مستخدم معين</label>
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(e.target.value)}
                className="input-field w-auto mt-1"
              >
                <option value="">الكل (نطاقي الكامل)</option>
                {selectableUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} — {ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] || u.role}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      )}

      {isInitialLoading ? (
        <div className="flex items-center justify-center h-48 print:hidden">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 print:grid-cols-1">
            <div className="lg:col-span-2 card print:shadow-none print:border print:break-inside-avoid">
              <h3 className="font-semibold text-secondary-900 mb-4 print:hidden">
                {currentReportLabel}
              </h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="name" stroke="#64748b" fontSize={12} />
                    <YAxis stroke="#64748b" fontSize={12} />
                    <Tooltip
                      formatter={(value: any) =>
                        (reportType === 'agents' || reportType === 'group_leaders' || reportType === 'supervisors')
                          ? `${value}%`
                          : formatCurrency(value)
                      }
                      contentStyle={{
                        direction: 'rtl',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0'
                      }}
                    />
                    {reportType === 'collection' || reportType === 'production_collection' ? (
                      <>
                        <Legend />
                        <Bar dataKey="المستحق" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="المسدد" fill="#22c55e" radius={[4, 4, 0, 0]} />
                      </>
                    ) : (
                      <Bar dataKey="value" fill="#22c55e" radius={[4, 4, 0, 0]} />
                    )}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="card print:shadow-none print:border print:break-inside-avoid">
              <h3 className="font-semibold text-secondary-900 mb-4">ملخص التقرير</h3>
              {data && (
                <div className="space-y-4">
                  {data.cancellationRate !== undefined && (
                    <div className="grid grid-cols-1 gap-3 print:grid-cols-1">
                      <button
                        type="button"
                        onClick={() => navigate('/cancellations')}
                        className="text-right p-4 bg-error-50 rounded-lg hover:bg-error-100 transition-colors print:bg-white print:border print:p-2"
                      >
                        <p className="text-sm text-secondary-600">نسبة الإلغاءات</p>
                        <p className="text-2xl font-bold text-error-700 mt-1">{data.cancellationRate}%</p>
                      </button>
                      <button
                        type="button"
                        onClick={() => navigate('/cancellations')}
                        className="text-right p-4 bg-error-50 rounded-lg hover:bg-error-100 transition-colors print:bg-white print:border print:p-2"
                      >
                        <p className="text-sm text-secondary-600">قيمة الإلغاءات</p>
                        <p className="text-2xl font-bold text-error-700 mt-1">{formatCurrency(data.cancelledValue)}</p>
                      </button>
                      <div className="p-4 bg-secondary-50 rounded-lg print:bg-white print:border print:p-2">
                        <p className="text-sm text-secondary-600">إجمالي الأقساط المسددة هذا العام</p>
                        <p className="text-lg font-semibold text-secondary-800 mt-1">{formatCurrency(data.totalCollected)}</p>
                        <p className="text-sm text-secondary-500 mt-1">{data.count} وثيقة داخلة في الحساب</p>
                      </div>
                    </div>
                  )}

                  {data.dueTotal !== undefined && (
                    <div className="grid grid-cols-1 gap-3 print:grid-cols-1">
                      <div className="p-4 bg-amber-50 rounded-lg print:bg-white print:border print:p-2">
                        <p className="text-sm text-secondary-600">المستحق خلال الفترة</p>
                        <p className="text-2xl font-bold text-amber-700 mt-1">{formatCurrency(data.dueTotal)}</p>
                      </div>
                      <div className="p-4 bg-success-50 rounded-lg print:bg-white print:border print:p-2">
                        <p className="text-sm text-secondary-600">المسدد فعلياً خلال الفترة</p>
                        <p className="text-2xl font-bold text-success-700 mt-1">{formatCurrency(data.paidTotal)}</p>
                        {data.count !== undefined && (
                          <p className="text-sm text-secondary-500 mt-1">{data.count} دفعة مسجّلة</p>
                        )}
                      </div>
                      <div className="p-4 bg-primary-50 rounded-lg print:bg-white print:border print:p-2">
                        <p className="text-sm text-secondary-600">نسبة التحصيل</p>
                        <p className="text-2xl font-bold text-primary-700 mt-1">
                          {data.collectionRatePeriod !== null ? `${data.collectionRatePeriod}%` : '—'}
                        </p>
                      </div>
                    </div>
                  )}

                  {data.total !== undefined && (
                    <div className="p-4 bg-primary-50 rounded-lg print:bg-white print:border print:p-2">
                      <p className="text-sm text-secondary-600">الإجمالي</p>
                      <p className="text-2xl font-bold text-primary-700 mt-1">
                        {(typeof data.total === 'number' && reportType.includes('production')) ||
                        reportType.includes('collection') ||
                        reportType === 'overdue'
                          ? formatCurrency(data.total)
                          : data.total}
                      </p>
                      {data.count !== undefined && (
                        <p className="text-sm text-secondary-500 mt-1">
                          {data.count} سجل
                        </p>
                      )}
                    </div>
                  )}

                  {data.byStatus && (
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <span className="text-secondary-600">نشط</span>
                        <span className="font-semibold text-success-700">{data.byStatus.active}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="text-secondary-600">ملغى</span>
                        <span className="font-semibold text-error-700">{data.byStatus.cancelled}</span>
                      </div>
                    </div>
                  )}

                  {data.agents && (
                    <div className="space-y-2 max-h-64 overflow-y-auto print:max-h-none print:overflow-visible">
                      {data.agents.map((agent: any, idx: number) => (
                        <PerformanceScoreRow key={agent.id || idx} name={agent.name} entry={agent} />
                      ))}
                    </div>
                  )}

                  {data.leaders && (
                    <div className="space-y-2 max-h-64 overflow-y-auto print:max-h-none print:overflow-visible">
                      {data.leaders.map((leader: any, idx: number) => (
                        <PerformanceScoreRow
                          key={leader.id || idx}
                          name={leader.name}
                          subLabel={`${leader.count} عضو`}
                          entry={leader}
                        />
                      ))}
                    </div>
                  )}

                  {data.supervisors && (
                    <div className="space-y-2 max-h-64 overflow-y-auto print:max-h-none print:overflow-visible">
                      {data.supervisors.map((supervisor: any, idx: number) => (
                        <PerformanceScoreRow
                          key={supervisor.id || idx}
                          name={supervisor.name}
                          subLabel={`${supervisor.count} عضو`}
                          entry={supervisor}
                        />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {(reportType === 'collection' || reportType === 'production_collection') ? (
            <CollectionDetailsByAgent
              installments={data?.installmentsRaw || []}
              statusFilter={statusFilter}
            />
          ) : (
            <div className="card print:shadow-none print:border print:break-inside-avoid">
              <h3 className="font-semibold text-secondary-900 mb-4">تفاصيل السجلات</h3>
              {detailsColumns.length > 0 ? (
                <div className="table-container print:hover:bg-transparent">
                  <table>
                    <thead>
                      <tr>
                        {detailsColumns.map((col) => (
                          <th key={col}>{col}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.details.map((row: Record<string, any>, idx: number) => (
                        <tr key={idx}>
                          {detailsColumns.map((col) => (
                            <td key={col}>{row[col]}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-sm text-secondary-400 text-center py-6">لا توجد سجلات في هذه الفترة</p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// مجموعة أزرار تقارير بعنوان واضح فوقها (تقارير عامة / تقارير أداء / نسبة
// الإلغاءات) بدل عرض كل الأزرار مبعثرة فى صف واحد بلا تصنيف.
function ReportButtonGroup({
  title,
  buttons,
  reportType,
  onSelect,
}: {
  title: string;
  buttons: { id: ReportType; label: string; icon: typeof Users }[];
  reportType: ReportType;
  onSelect: (id: ReportType) => void;
}) {
  return (
    <div>
      <p className="text-xs font-semibold text-secondary-400 mb-2">{title}</p>
      <div className="flex flex-wrap gap-2">
        {buttons.map((btn) => {
          const Icon = btn.icon;
          const active = reportType === btn.id;
          return (
            <button
              key={btn.id}
              onClick={() => onSelect(btn.id)}
              className={clsx(
                'flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-sm font-medium border transition-colors',
                active
                  ? 'bg-primary-600 border-primary-600 text-white shadow-sm'
                  : 'bg-white border-secondary-200 text-secondary-600 hover:bg-secondary-50 hover:border-secondary-300'
              )}
            >
              <Icon className="w-4 h-4" />
              {btn.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// صف واحد فى قائمة "أداء الوكلاء/رؤساء المجموعات/المراقبين" بملخص التقرير:
// يعرض "التقييم الشامل" (المدمج) كرقم رئيسي، مع تفصيل بسيط تحته (النسبة
// المالية ودرجة النشاط)، وتنويه واضح لو الدرجة اعتمدت على المالي فقط لعدم
// وجود بيانات نشاط مسجَّلة فى الفترة
function PerformanceScoreRow({
  name,
  subLabel,
  entry,
}: {
  name: string;
  subLabel?: string;
  entry: {
    finalScore: number; financialRate: number; activityScore: number | null;
    financialOnly: boolean; ratingLabel: string; ratingColorClass: string;
    activity?: {
      hasData: boolean; punctualityPct: number;
      appointmentsQualityTotal: number; appointmentsQualityScore: number | null; appointmentsQualityLabel: string;
    };
  };
}) {
  const activity = entry.activity;
  const showQuality = activity?.hasData && activity.appointmentsQualityTotal > 0;

  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-secondary-600">
        {name} {subLabel && <span className="text-xs text-secondary-400">({subLabel})</span>}
      </span>
      <div className="text-left">
        <div className="flex items-center gap-2 justify-end">
          <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', entry.ratingColorClass)}>
            {entry.ratingLabel}
          </span>
          <span className="font-semibold">{entry.finalScore}%</span>
        </div>
        <p className="text-[11px] text-secondary-400 mt-0.5">
          {entry.financialOnly
            ? 'مالي فقط — لا توجد بيانات نشاط'
            : `مالي ${entry.financialRate}% • نشاط ${entry.activityScore}%`}
        </p>
        {activity?.hasData && (
          <p className="text-[11px] text-secondary-400 mt-0.5">
            الالتزام {activity.punctualityPct}%
            {showQuality && ` • جودة المواعيد ${activity.appointmentsQualityScore}% (${activity.appointmentsQualityLabel})`}
          </p>
        )}
      </div>
    </div>
  );
}

type RawInstallment = {
  agentId: string | null;
  agentName: string;
  customerName: string;
  policyNumber: string;
  dueDate: string;
  amount: number;
  status: 'paid' | 'unpaid';
};

// جدول تفاصيل منظّم لتقارير التحصيل: بيجمع الأقساط تحت اسم كل وكيل، وبيحط
// تحت كل وكيل إجمالي المسدد وإجمالي المتبقي غير المسدد، ثم إجمالي عام فى
// الآخر. الفلتر (statusFilter) بيحدد إيه اللي يظهر فى الجدول نفسه بس —
// لو "الكل": بتتعرض كل الأقساط وتحت كل وكيل السطرين (مسدد + غير مسدد).
// لو "مسدد" أو "غير مسدد": بتتعرض بس الأقساط المطابقة، وتحت كل وكيل سطر
// واحد بالإجمالي المطابق.
function CollectionDetailsByAgent({
  installments,
  statusFilter,
}: {
  installments: RawInstallment[];
  statusFilter: 'all' | 'paid' | 'unpaid';
}) {
  const filtered = statusFilter === 'all'
    ? installments
    : installments.filter((i) => i.status === statusFilter);

  const groups = new Map<string, RawInstallment[]>();
  filtered.forEach((i) => {
    const key = i.agentId || i.agentName;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(i);
  });

  const sortedGroups = Array.from(groups.entries()).sort((a, b) =>
    a[1][0].agentName.localeCompare(b[1][0].agentName, 'ar')
  );

  const grandPaid = filtered.filter((i) => i.status === 'paid').reduce((s, i) => s + i.amount, 0);
  const grandUnpaid = filtered.filter((i) => i.status === 'unpaid').reduce((s, i) => s + i.amount, 0);

  return (
    <div className="card print:shadow-none print:border print:break-inside-avoid">
      <h3 className="font-semibold text-secondary-900 mb-4">تفاصيل السجلات (مجمّعة حسب الوكيل)</h3>
      {sortedGroups.length > 0 ? (
        <div className="space-y-6">
          {sortedGroups.map(([agentKey, rows]) => {
            const agentPaid = rows.filter((r) => r.status === 'paid').reduce((s, r) => s + r.amount, 0);
            const agentUnpaid = rows.filter((r) => r.status === 'unpaid').reduce((s, r) => s + r.amount, 0);
            return (
              <div key={agentKey} className="print:break-inside-avoid">
                <h4 className="font-semibold text-secondary-800 mb-2 border-b border-secondary-200 pb-1">
                  {rows[0].agentName}
                </h4>
                <div className="table-container print:hover:bg-transparent">
                  <table>
                    <thead>
                      <tr>
                        <th>العميل</th>
                        <th>رقم الوثيقة</th>
                        <th>التاريخ</th>
                        <th>المبلغ</th>
                        <th>الحالة</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, idx) => (
                        <tr key={idx}>
                          <td>{r.customerName}</td>
                          <td>{r.policyNumber}</td>
                          <td>{format(new Date(r.dueDate), 'd MMMM yyyy', { locale: ar })}</td>
                          <td>{formatCurrency(r.amount)}</td>
                          <td>{r.status === 'paid' ? 'مسدد' : 'غير مسدد'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      {statusFilter !== 'unpaid' && (
                        <tr>
                          <td colSpan={3} className="font-semibold text-success-700">إجمالي المسدد</td>
                          <td colSpan={2} className="font-semibold text-success-700">{formatCurrency(agentPaid)}</td>
                        </tr>
                      )}
                      {statusFilter !== 'paid' && (
                        <tr>
                          <td colSpan={3} className="font-semibold text-amber-700">إجمالي المتبقي غير المسدد</td>
                          <td colSpan={2} className="font-semibold text-amber-700">{formatCurrency(agentUnpaid)}</td>
                        </tr>
                      )}
                    </tfoot>
                  </table>
                </div>
              </div>
            );
          })}

          <div className="pt-3 border-t-2 border-secondary-300 print:break-inside-avoid">
            <div className="flex flex-wrap gap-4">
              {statusFilter !== 'unpaid' && (
                <div className="p-3 bg-success-50 rounded-lg print:bg-white print:border">
                  <p className="text-sm text-secondary-600">إجمالي المسدد (كل الوكلاء)</p>
                  <p className="text-lg font-bold text-success-700">{formatCurrency(grandPaid)}</p>
                </div>
              )}
              {statusFilter !== 'paid' && (
                <div className="p-3 bg-amber-50 rounded-lg print:bg-white print:border">
                  <p className="text-sm text-secondary-600">إجمالي المتبقي غير المسدد (كل الوكلاء)</p>
                  <p className="text-lg font-bold text-amber-700">{formatCurrency(grandUnpaid)}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-secondary-400 text-center py-6">لا توجد سجلات مطابقة لهذه الفلاتر</p>
      )}
    </div>
  );
}
