import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase, POLICY_TYPE_LABELS, POLICY_STATUS_LABELS } from '../lib/supabase';
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
import { format, startOfMonth, endOfMonth, subMonths, startOfYear, endOfYear } from 'date-fns';
import { ar } from 'date-fns/locale';

type ReportType = 'customers' | 'policies' | 'production' | 'collection' | 'overdue' | 'agents' | 'group_leaders' | 'supervisors';
type DateRange = 'month' | 'quarter' | 'year' | 'custom';

export function Reports() {
  const { user } = useAuth();
  const [reportType, setReportType] = useState<ReportType>('production');
  const [dateRange, setDateRange] = useState<DateRange>('month');
  // فلتر الشهر: بصيغة yyyy-MM، يُستخدم فقط عندما تكون dateRange = 'month'
  const [selectedMonth, setSelectedMonth] = useState<string>(format(new Date(), 'yyyy-MM'));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);

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
      const { data: subtree } = await supabase.rpc('get_user_subtree', {
        user_id: user?.id
      });
      const userIds = subtree || [user?.id];
      const { start, end } = getDateRange();

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
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name, created_at')
      .in('owner_id', userIds)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString())
      .order('created_at', { ascending: false });

    const byMonth: Record<string, number> = {};
    (customers || []).forEach((c: any) => {
      const month = format(new Date(c.created_at), 'MMM yyyy', { locale: ar });
      byMonth[month] = (byMonth[month] || 0) + 1;
    });

    const chart = Object.entries(byMonth).map(([month, count]) => ({
      name: month,
      value: count
    }));

    const details = (customers || []).map((c: any) => ({
      'اسم العميل': c.name,
      'تاريخ التسجيل': format(new Date(c.created_at), 'd MMMM yyyy', { locale: ar })
    }));

    setData({ customers: customers?.length || 0, total: customers?.length || 0, details });
    setChartData(chart);
  };

  const loadPoliciesReport = async (userIds: string[]) => {
    const { data: policies } = await supabase
      .from('policies')
      .select('id, policy_number, status, policy_type, start_date, customer:customer_id(name)')
      .in('owner_id', userIds)
      .order('start_date', { ascending: false });

    const byStatus = {
      active: policies?.filter((p) => p.status === 'active').length || 0,
      suspended: policies?.filter((p) => p.status === 'suspended').length || 0,
      cancelled: policies?.filter((p) => p.status === 'cancelled').length || 0
    };

    const byType: Record<string, number> = {};
    (policies || []).forEach((p: any) => {
      const type = p.policy_type;
      byType[type] = (byType[type] || 0) + 1;
    });

    const chart = [
      { name: 'نشط', value: byStatus.active, color: '#22c55e' },
      { name: 'موقوف', value: byStatus.suspended, color: '#f59e0b' },
      { name: 'ملغى', value: byStatus.cancelled, color: '#ef4444' }
    ];

    const details = (policies || []).map((p: any) => ({
      'رقم الوثيقة': p.policy_number,
      'العميل': p.customer?.name || '-',
      'النوع': POLICY_TYPE_LABELS[p.policy_type as keyof typeof POLICY_TYPE_LABELS] || p.policy_type,
      'الحالة': POLICY_STATUS_LABELS[p.status as keyof typeof POLICY_STATUS_LABELS] || p.status,
      'تاريخ البداية': p.start_date ? format(new Date(p.start_date), 'd MMMM yyyy', { locale: ar }) : '-'
    }));

    setData({ total: policies?.length || 0, byStatus, byType, details });
    setChartData(chart);
  };

  const loadProductionReport = async (userIds: string[], start: Date, end: Date) => {
    const { data: payments } = await supabase
      .from('payments')
      .select(
        'amount, payment_month, installment:installment_id(is_first, policy:policy_id(owner_id, policy_number, customer:customer_id(name), owner:owner_id(name)))'
      )
      .gte('payment_month', format(start, 'yyyy-MM-dd'))
      .lte('payment_month', format(end, 'yyyy-MM-dd'))
      .eq('is_cancelled', false);

    const filtered = (payments || []).filter(
      (p: any) => userIds.includes(p.installment?.policy?.owner_id) && p.installment?.is_first
    );

    const byMonth: Record<string, number> = {};
    filtered.forEach((p: any) => {
      const month = format(new Date(p.payment_month), 'MMM yyyy', { locale: ar });
      byMonth[month] = (byMonth[month] || 0) + Number(p.amount);
    });

    const total = filtered.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
    const chart = Object.entries(byMonth).map(([month, value]) => ({ name: month, value }));

    const details = filtered.map((p: any) => ({
      'العميل': p.installment?.policy?.customer?.name || '-',
      'الوكيل': p.installment?.policy?.owner?.name || '-',
      'رقم الوثيقة': p.installment?.policy?.policy_number || '-',
      'الشهر': format(new Date(p.payment_month), 'MMM yyyy', { locale: ar }),
      'المبلغ': formatCurrency(Number(p.amount))
    }));

    setData({ total, count: filtered.length, details });
    setChartData(chart);
  };

  const loadCollectionReport = async (userIds: string[], start: Date, end: Date) => {
    const { data: payments } = await supabase
      .from('payments')
      .select(
        'amount, payment_month, installment:installment_id(is_first, policy:policy_id(owner_id, policy_number, customer:customer_id(name), owner:owner_id(name)))'
      )
      .gte('payment_month', format(start, 'yyyy-MM-dd'))
      .lte('payment_month', format(end, 'yyyy-MM-dd'))
      .eq('is_cancelled', false);

    const filtered = (payments || []).filter(
      (p: any) => userIds.includes(p.installment?.policy?.owner_id) && !p.installment?.is_first
    );

    const byMonth: Record<string, number> = {};
    filtered.forEach((p: any) => {
      const month = format(new Date(p.payment_month), 'MMM yyyy', { locale: ar });
      byMonth[month] = (byMonth[month] || 0) + Number(p.amount);
    });

    const total = filtered.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
    const chart = Object.entries(byMonth).map(([month, value]) => ({ name: month, value }));

    const details = filtered.map((p: any) => ({
      'العميل': p.installment?.policy?.customer?.name || '-',
      'الوكيل': p.installment?.policy?.owner?.name || '-',
      'رقم الوثيقة': p.installment?.policy?.policy_number || '-',
      'الشهر': format(new Date(p.payment_month), 'MMM yyyy', { locale: ar }),
      'المبلغ': formatCurrency(Number(p.amount))
    }));

    setData({ total, count: filtered.length, details });
    setChartData(chart);
  };

  const loadOverdueReport = async (userIds: string[]) => {
    const { data: installments } = await supabase
      .from('installments')
      .select('id, amount, due_date, policy:policy_id(owner_id, policy_number, customer:customer_id(name))');

    const overdue = (installments || []).filter(
      (i: any) => userIds.includes(i.policy?.owner_id) && new Date(i.due_date) < new Date() && i.status !== 'paid'
    );

    const total = overdue.reduce((sum: number, i: any) => sum + Number(i.amount), 0);
    const chart = [{ name: 'متأخر', value: total }];

    const details = overdue.map((i: any) => ({
      'العميل': i.policy?.customer?.name || '-',
      'رقم الوثيقة': i.policy?.policy_number || '-',
      'تاريخ الاستحقاق': format(new Date(i.due_date), 'd MMMM yyyy', { locale: ar }),
      'المبلغ': formatCurrency(Number(i.amount))
    }));

    setData({ total, count: overdue.length, details });
    setChartData(chart);
  };

  const loadAgentsReport = async (userIds: string[], start: Date, end: Date) => {
    const { data: agents } = await supabase
      .from('users')
      .select('id, name, target')
      .in('id', userIds)
      .in('role', ['agent', 'premium_agent'])
      .eq('is_active', true);

    const { data: payments } = await supabase
      .from('payments')
      .select('amount, installment:installment_id(policy:policy_id(owner_id))')
      .gte('payment_month', format(start, 'yyyy-MM-dd'))
      .lte('payment_month', format(end, 'yyyy-MM-dd'))
      .eq('is_cancelled', false);

    const agentPerformance: any[] = [];

    for (const agent of agents || []) {
      const achieved = (payments || [])
        .filter((p: any) => p.installment?.policy?.owner_id === agent.id)
        .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

      agentPerformance.push({
        name: agent.name,
        achieved,
        target: agent.target || 0,
        rate: agent.target > 0 ? Math.round((achieved / agent.target) * 100) : 0
      });
    }

    const sorted = agentPerformance.sort((a, b) => b.achieved - a.achieved);

    const details = sorted.map((a: any) => ({
      'اسم الوكيل': a.name,
      'المحقق': formatCurrency(a.achieved),
      'الهدف': formatCurrency(a.target),
      'نسبة التحقيق': `${a.rate}%`
    }));

    setData({ agents: sorted, details });
    setChartData(sorted.slice(0, 10));
  };

  const loadGroupLeadersReport = async (userIds: string[], start: Date, end: Date) => {
    const { data: leaders } = await supabase
      .from('users')
      .select('id, name')
      .in('id', userIds)
      .eq('role', 'group_leader')
      .eq('is_active', true);

    const performance: any[] = [];

    for (const leader of leaders || []) {
      const { data: subtree } = await supabase.rpc('get_user_subtree', {
        user_id: leader.id
      });
      const teamIds: string[] = subtree || [leader.id];

      const { data: payments } = await supabase
        .from('payments')
        .select('amount, installment:installment_id(policy:policy_id(owner_id))')
        .gte('payment_month', format(start, 'yyyy-MM-dd'))
        .lte('payment_month', format(end, 'yyyy-MM-dd'))
        .eq('is_cancelled', false);

      const achieved = (payments || [])
        .filter((p: any) => teamIds.includes(p.installment?.policy?.owner_id))
        .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

      performance.push({
        id: leader.id,
        name: leader.name,
        count: teamIds.length - 1,
        achieved
      });
    }

    const details = performance.map((p: any) => ({
      'رئيس المجموعة': p.name,
      'عدد الأعضاء': p.count,
      'المحقق': formatCurrency(p.achieved)
    }));

    setData({ leaders: performance, details });
    setChartData(performance);
  };

  const loadSupervisorsReport = async (userIds: string[], start: Date, end: Date) => {
    const { data: supervisors } = await supabase
      .from('users')
      .select('id, name')
      .in('id', userIds)
      .in('role', ['supervisor', 'general_supervisor'])
      .eq('is_active', true);

    const performance: any[] = [];

    for (const supervisor of supervisors || []) {
      const { data: subtree } = await supabase.rpc('get_user_subtree', {
        user_id: supervisor.id
      });
      const teamIds: string[] = subtree || [supervisor.id];

      const { data: payments } = await supabase
        .from('payments')
        .select('amount, installment:installment_id(policy:policy_id(owner_id))')
        .gte('payment_month', format(start, 'yyyy-MM-dd'))
        .lte('payment_month', format(end, 'yyyy-MM-dd'))
        .eq('is_cancelled', false);

      const achieved = (payments || [])
        .filter((p: any) => teamIds.includes(p.installment?.policy?.owner_id))
        .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

      performance.push({
        id: supervisor.id,
        name: supervisor.name,
        count: teamIds.length - 1,
        achieved
      });
    }

    const details = performance.map((p: any) => ({
      'المراقب': p.name,
      'عدد الأعضاء': p.count,
      'المحقق': formatCurrency(p.achieved)
    }));

    setData({ supervisors: performance, details });
    setChartData(performance);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency: 'EGP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const reportButtons: { id: ReportType; label: string }[] = [
    { id: 'customers', label: 'تقرير العملاء' },
    { id: 'policies', label: 'تقرير الوثائق' },
    { id: 'production', label: 'الإنتاج الجديد' },
    { id: 'collection', label: 'التحصيل الدوري' },
    { id: 'overdue', label: 'الأقساط المتأخرة' },
    { id: 'agents', label: 'أداء الوكلاء' },
    { id: 'group_leaders', label: 'أداء رؤساء المجموعات' },
    { id: 'supervisors', label: 'أداء المراقبين' }
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
          <h2 className="text-xl font-bold text-secondary-900">التقارير</h2>
          <p className="text-sm text-secondary-500 mt-1">
            تقارير وإحصائيات الأداء
          </p>
        </div>
        <button
          onClick={() => window.print()}
          className="btn btn-secondary flex items-center gap-2"
          title="طباعة التقرير"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="6 9 6 2 18 2 18 9" />
            <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
            <rect x="6" y="14" width="12" height="8" />
          </svg>
          طباعة
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

      {loading ? (
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
                        <span className="text-secondary-600">موقوف</span>
                        <span className="font-semibold text-warning-700">{data.byStatus.suspended}</span>
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
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-secondary-200">
                      {detailsColumns.map((col) => (
                        <th
                          key={col}
                          className="text-right py-2 px-3 text-secondary-500 font-medium whitespace-nowrap"
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.details.map((row: Record<string, any>, idx: number) => (
                      <tr
                        key={idx}
                        className="border-b border-secondary-100 hover:bg-secondary-50 print:hover:bg-transparent"
                      >
                        {detailsColumns.map((col) => (
                          <td key={col} className="py-2 px-3 text-secondary-700 whitespace-nowrap">
                            {row[col]}
                          </td>
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