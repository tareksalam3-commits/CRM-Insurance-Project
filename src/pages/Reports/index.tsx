import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer
} from 'recharts';
import clsx from 'clsx';
import { Printer } from 'lucide-react';
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from 'date-fns';
import { ar } from 'date-fns/locale';

import type { ReportType, DateRange } from './types';
import {
  fetchUserSubtreeIds, fetchCustomersInRange, fetchPoliciesForOwners, fetchPaymentsInRange,
  fetchAllInstallmentsWithPolicy, fetchAgentsForReport, fetchSimplePaymentsInRange,
  fetchUsersByRole, fetchLeadersPerformance,
} from './services/reportsService';
import {
  formatCurrency, computeCustomersReport, computePoliciesReport, computeProductionReport,
  computeCollectionReport, computeOverdueReport, computeAgentsReport, computeTeamPerformanceReport,
  computeCancellationsReport,
} from './business/reportsCalculator';
import { loadCancellationSummary } from '../Cancellations/services/cancellationService';

export function Reports() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [reportType, setReportType] = useState<ReportType>('production');
  const [dateRange, setDateRange] = useState<DateRange>('month');
  // فلتر الشهر: بصيغة yyyy-MM، يُستخدم فقط عندما تكون dateRange = 'month'
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);
  // أول تحميل فقط (لسه مفيش بيانات لأي تقرير) يستحق شاشة تحميل كاملة —
  // تبديل نوع التقرير أو الفلتر بعد كده يحافظ على آخر تقرير ظاهر مع
  // مؤشر تحديث بسيط بدل ما تختفي الشاشة بالكامل فى كل مرة
  const isInitialLoading = loading && data === null;

  useEffect(() => {
    if (user) {
      loadReport();
    }
  }, [user, reportType, dateRange, selectedMonth]);

  const getDateRange = () => {
    const now = new Date();
    switch (dateRange) {
      case 'month': {
        // استخدام الشهر المُختار من الفلتر بدل الاعتماد دائماً على الشهر الحالي
        const base = selectedMonth ? new Date(`${selectedMonth}-01T00:00:00`) : now;
        return { start: startOfMonth(base), end: endOfMonth(base) };
      }
      case 'quarter':
        return { start: subMonths(startOfMonth(now), 2), end: endOfMonth(now) };
      case 'year':
        return { start: startOfYear(now), end: endOfYear(now) };
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

      const userIds = await fetchUserSubtreeIds(user!.id);

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
    const payments = await fetchPaymentsInRange(start, end);
    const { data: reportData, chartData: chart } = computeCollectionReport(payments, userIds);
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
    // الدالتان مستقلتان (لا تعتمد إحداهما على نتيجة الأخرى) — تنفيذهما بالتوازي
    // بدل التسلسل يقلّل زمن التحميل دون أي تغيير فى النتيجة
    const [agents, payments] = await Promise.all([
      fetchAgentsForReport(userIds),
      fetchSimplePaymentsInRange(start, end),
    ]);
    const { data: reportData, chartData: chart } = computeAgentsReport(agents, payments);
    setData(reportData);
    setChartData(chart);
  };

  const loadGroupLeadersReport = async (userIds: string[], start: Date, end: Date) => {
    const leaders = await fetchUsersByRole(userIds, ['group_leader']);
    const performance = await fetchLeadersPerformance(leaders, start, end);
    const { details } = computeTeamPerformanceReport(performance, 'رئيس المجموعة');

    setData({ leaders: performance, details });
    setChartData(performance);
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
    const performance = await fetchLeadersPerformance(supervisors, start, end);
    const { details } = computeTeamPerformanceReport(performance, 'المراقب');

    setData({ supervisors: performance, details });
    setChartData(performance);
  };

  const reportButtons: { id: ReportType; label: string }[] = [
    { id: 'customers', label: 'تقرير العملاء' },
    { id: 'policies', label: 'تقرير الوثائق' },
    { id: 'production', label: 'الإنتاج الجديد' },
    { id: 'collection', label: 'التحصيل الدوري' },
    { id: 'overdue', label: 'الأقساط المتأخرة' },
    { id: 'agents', label: 'أداء الوكلاء' },
    { id: 'group_leaders', label: 'أداء رؤساء المجموعات' },
    { id: 'supervisors', label: 'أداء المراقبين' },
    { id: 'cancellations', label: 'نسبة الإلغاءات' }
  ];

  const { start: periodStart, end: periodEnd } = getDateRange();
  const currentReportLabel = reportButtons.find((r) => r.id === reportType)?.label;
  const detailsColumns = data?.details && data.details.length > 0 ? Object.keys(data.details[0]) : [];

  return (
    <div className="space-y-6 animate-fadeIn print:space-y-3">
      {/* رأس خاص بالطباعة فقط - لا يظهر على الشاشة */}
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

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-secondary-900 flex items-center gap-2">
            <span>التقارير الشاملة</span>
            {loading && !isInitialLoading && (
              <span className="inline-flex items-center gap-1 text-secondary-400 text-xs font-normal">
                <span className="w-3 h-3 rounded-full border-2 border-secondary-300 border-t-primary-500 animate-spin" />
                <span>جارِ التحديث...</span>
              </span>
            )}
          </h2>
          <p className="text-sm text-secondary-500 mt-1">
            تقارير وإحصائيات الأداء
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="btn btn-secondary"
          title="طباعة التقرير"
        >
          <Printer className="w-4 h-4" />
          <span>طباعة</span>
        </button>
      </div>

      <div className="flex flex-wrap gap-2 print:hidden">
        {reportButtons.map((btn) => (
          <button
            key={btn.id}
            onClick={() => setReportType(btn.id)}
            className={clsx(
              'btn',
              reportType === btn.id ? 'btn-primary' : 'btn-secondary'
            )}
          >
            {btn.label}
          </button>
        ))}
      </div>

      {reportType === 'cancellations' ? (
        <p className="text-sm text-secondary-500 print:hidden">
          فترة الحساب ثابتة دائماً: من أول يناير حتى نهاية الشهر الحالي من سنة {new Date().getFullYear()}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2 mb-4 print:hidden">
          <select
            value={dateRange}
            onChange={(e) => setDateRange(e.target.value as DateRange)}
            className="input-field w-auto"
          >
            <option value="month">شهر محدد</option>
            <option value="quarter">الربع السنوي</option>
            <option value="year">السنة الحالية</option>
          </select>

          {dateRange === 'month' && (
            <input
              type="month"
              value={selectedMonth}
              onChange={(e) => setSelectedMonth(e.target.value)}
              className="input-field w-auto"
            />
          )}
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
                      formatter={(value: any) => formatCurrency(value)}
                      contentStyle={{
                        direction: 'rtl',
                        borderRadius: '8px',
                        border: '1px solid #e2e8f0'
                      }}
                    />
                    <Bar dataKey="value" fill="#22c55e" radius={[4, 4, 0, 0]} />
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
                        <div key={agent.id || idx} className="flex justify-between items-center">
                          <span className="text-secondary-600">{agent.name}</span>
                          <span className="font-semibold">{agent.rate}%</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {data.leaders && (
                    <div className="space-y-2 max-h-64 overflow-y-auto print:max-h-none print:overflow-visible">
                      {data.leaders.map((leader: any, idx: number) => (
                        <div key={leader.id || idx} className="flex justify-between items-center">
                          <span className="text-secondary-600">
                            {leader.name} <span className="text-xs text-secondary-400">({leader.count} عضو)</span>
                          </span>
                          <span className="font-semibold">{formatCurrency(leader.achieved)}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {data.supervisors && (
                    <div className="space-y-2 max-h-64 overflow-y-auto print:max-h-none print:overflow-visible">
                      {data.supervisors.map((supervisor: any, idx: number) => (
                        <div key={supervisor.id || idx} className="flex justify-between items-center">
                          <span className="text-secondary-600">
                            {supervisor.name}{' '}
                            <span className="text-xs text-secondary-400">({supervisor.count} عضو)</span>
                          </span>
                          <span className="font-semibold">{formatCurrency(supervisor.achieved)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

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
        </>
      )}
    </div>
  );
}
