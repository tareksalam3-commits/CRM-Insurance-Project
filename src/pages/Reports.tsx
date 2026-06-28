import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
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
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    if (user) {
      loadReport();
    }
  }, [user, reportType, dateRange]);

  const getDateRange = () => {
    const now = new Date();
    switch (dateRange) {
      case 'month':
        return { start: startOfMonth(now), end: endOfMonth(now) };
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
          await loadCustomersReport(userIds);
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

  const loadCustomersReport = async (userIds: string[]) => {
    const { data: customers } = await supabase
      .from('customers')
      .select('id, name, created_at')
      .in('owner_id', userIds)
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

    setData({ customers: customers?.length || 0, total: customers?.length || 0 });
    setChartData(chart);
  };

  const loadPoliciesReport = async (userIds: string[]) => {
    const { data: policies } = await supabase
      .from('policies')
      .select('id, status, policy_type')
      .in('owner_id', userIds);

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

    setData({ total: policies?.length || 0, byStatus, byType });
    setChartData(chart);
  };

  const loadProductionReport = async (userIds: string[], start: Date, end: Date) => {
    const { data: payments } = await supabase
      .from('payments')
      .select('amount, payment_month, installment:installment_id(is_first, policy:policy_id(owner_id))')
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

    setData({ total, count: filtered.length });
    setChartData(chart);
  };

  const loadCollectionReport = async (userIds: string[], start: Date, end: Date) => {
    const { data: payments } = await supabase
      .from('payments')
      .select('amount, payment_month, installment:installment_id(is_first, policy:policy_id(owner_id))')
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

    setData({ total, count: filtered.length });
    setChartData(chart);
  };

  const loadOverdueReport = async (userIds: string[]) => {
    const { data: installments } = await supabase
      .from('installments')
      .select('id, amount, due_date, policy:policy_id(owner_id)');

    const overdue = (installments || []).filter(
      (i: any) => userIds.includes(i.policy?.owner_id) && new Date(i.due_date) < new Date() && i.status !== 'paid'
    );

    const total = overdue.reduce((sum: number, i: any) => sum + Number(i.amount), 0);
    const chart = [{ name: 'متأخر', value: total }];

    setData({ total, count: overdue.length });
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

    setData({ agents: agentPerformance.sort((a, b) => b.achieved - a.achieved) });
    setChartData(agentPerformance.slice(0, 10));
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
        name: leader.name,
        count: teamIds.length - 1,
        achieved
      });
    }

    setData({ leaders: performance });
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
        name: supervisor.name,
        count: teamIds.length - 1,
        achieved
      });
    }

    setData({ supervisors: performance });
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

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-secondary-900">التقارير</h2>
          <p className="text-sm text-secondary-500 mt-1">
            تقارير وإحصائيات الأداء
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
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

      <div className="flex flex-wrap gap-2 mb-4">
        <select
          value={dateRange}
          onChange={(e) => setDateRange(e.target.value as DateRange)}
          className="input-field w-auto"
        >
          <option value="month">الشهر الحالي</option>
          <option value="quarter">الربع السنوي</option>
          <option value="year">السنة الحالية</option>
        </select>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 card">
            <h3 className="font-semibold text-secondary-900 mb-4">
              {reportButtons.find((r) => r.id === reportType)?.label}
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

          <div className="card">
            <h3 className="font-semibold text-secondary-900 mb-4">ملخص التقرير</h3>
            {data && (
              <div className="space-y-4">
                {data.total !== undefined && (
                  <div className="p-4 bg-primary-50 rounded-lg">
                    <p className="text-sm text-secondary-600">الإجمالي</p>
                    <p className="text-2xl font-bold text-primary-700 mt-1">
                      {typeof data.total === 'number' && reportType.includes('production') || reportType.includes('collection') || reportType === 'overdue'
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
                  <div className="space-y-2">
                    {data.agents.slice(0, 5).map((agent: any, idx: number) => (
                      <div key={agent.id || idx} className="flex justify-between items-center">
                        <span className="text-secondary-600">{agent.name}</span>
                        <span className="font-semibold">{agent.rate}%</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
