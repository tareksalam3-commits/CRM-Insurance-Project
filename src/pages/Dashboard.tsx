import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase } from '../lib/supabase';
import {
  Users,
  FileText,
  TrendingUp,
  DollarSign,
  AlertCircle,
  CheckCircle,
  Clock,
  Target
} from 'lucide-react';
import clsx from 'clsx';
import { format, startOfMonth, endOfMonth, isWithinInterval } from 'date-fns';
import { ar } from 'date-fns/locale';
import {
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

interface DashboardStats {
  totalCustomers: number;
  totalPolicies: number;
  activePolicies: number;
  suspendedPolicies: number;
  cancelledPolicies: number;
  newProduction: number;
  newProductionCount: number;
  periodicCollection: number;
  periodicCollectionCount: number;
  dueInstallments: number;
  dueInstallmentsCount: number;
  overdueInstallments: number;
  overdueInstallmentsCount: number;
  paidInstallments: number;
  paidInstallmentsCount: number;
  target: number;
  achieved: number;
  remaining: number;
  achievementRate: number;
}

interface TeamPerformance {
  id: string;
  name: string;
  achieved: number;
  target: number;
}

export function Dashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [teamPerformance, setTeamPerformance] = useState<TeamPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<{ production: number; collection: number }>({ production: 0, collection: 0 });
  const [newTarget, setNewTarget] = useState(0);

  useEffect(() => {
    if (user) {
      setNewTarget(user.target);
    }
  }, [user]);

  useEffect(() => {
    if (user) {
      loadDashboardData();
    }
  }, [user]);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      const monthStartStr = format(monthStart, 'yyyy-MM-dd');

      const { data: subtree } = await supabase.rpc('get_user_subtree', {
        user_id: user?.id
      });

      const userIds = subtree || [user?.id];

      const [
        customersRes,
        policiesRes,
        installmentsRes,
        paymentsRes
      ] = await Promise.all([
        supabase
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .in('owner_id', userIds),

        supabase
          .from('policies')
          .select('id, status, owner_id')
          .in('owner_id', userIds),

        supabase
          .from('installments')
          .select('id, amount, due_date, status, is_first, policy:policy_id(owner_id)')
          .in('status', ['pending', 'overdue']),

        supabase
          .from('payments')
          .select('id, amount, payment_month, is_cancelled, installment:installment_id(is_first, policy:policy_id(owner_id))')
          .eq('payment_month', monthStartStr)
          .eq('is_cancelled', false)
      ]);

      const filteredInstallments = (installmentsRes.data || []).filter(
        (i: any) => userIds.includes(i.policy?.owner_id)
      );

      const filteredPayments = (paymentsRes.data || []).filter(
        (p: any) => userIds.includes(p.installment?.policy?.owner_id)
      );

      const policies = policiesRes.data || [];
      const activePolicies = policies.filter((p) => p.status === 'active').length;
      const suspendedPolicies = policies.filter((p) => p.status === 'suspended').length;
      const cancelledPolicies = policies.filter((p) => p.status === 'cancelled').length;

      const dueInstallments = filteredInstallments.filter((i: any) => {
        const dueDate = new Date(i.due_date);
        return isWithinInterval(dueDate, { start: monthStart, end: monthEnd });
      });

      const overdueInstallments = filteredInstallments.filter((i: any) => {
        const dueDate = new Date(i.due_date);
        return dueDate < monthStart;
      });

      const newProduction = filteredPayments.filter((p: any) => p.installment?.is_first);
      const periodicCollection = filteredPayments.filter((p: any) => !p.installment?.is_first);

      const totalTarget = newTarget || 0;
      const totalAchieved = newProduction.reduce((sum: number, p: any) => sum + Number(p.amount), 0) +
        periodicCollection.reduce((sum: number, p: any) => sum + Number(p.amount), 0);

      setStats({
        totalCustomers: customersRes.count || 0,
        totalPolicies: policies.length,
        activePolicies,
        suspendedPolicies,
        cancelledPolicies,
        newProduction: newProduction.reduce((sum: number, p: any) => sum + Number(p.amount), 0),
        newProductionCount: newProduction.length,
        periodicCollection: periodicCollection.reduce((sum: number, p: any) => sum + Number(p.amount), 0),
        periodicCollectionCount: periodicCollection.length,
        dueInstallments: dueInstallments.reduce((sum: number, i: any) => sum + Number(i.amount), 0),
        dueInstallmentsCount: dueInstallments.length,
        overdueInstallments: overdueInstallments.reduce((sum: number, i: any) => sum + Number(i.amount), 0),
        overdueInstallmentsCount: overdueInstallments.length,
        paidInstallments: filteredPayments.reduce((sum: number, p: any) => sum + Number(p.amount), 0),
        paidInstallmentsCount: filteredPayments.length,
        target: totalTarget,
        achieved: totalAchieved,
        remaining: Math.max(0, totalTarget - totalAchieved),
        achievementRate: totalTarget > 0 ? Math.round((totalAchieved / totalTarget) * 100) : 0
      });

      await loadTeamPerformance(userIds);
      await loadChartData(userIds);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTeamPerformance = async (userIds: string[]) => {
    const now = new Date();
    const monthStart = startOfMonth(now);
    const monthStartStr = format(monthStart, 'yyyy-MM-dd');

    const { data: teamUsers } = await supabase
      .from('users')
      .select('id, name, target')
      .in('id', userIds)
      .eq('is_active', true)
      .limit(10);

    if (!teamUsers) return;

    const performance: TeamPerformance[] = [];

    for (const teamUser of teamUsers) {
      const { data: payments } = await supabase
        .from('payments')
        .select('amount, installment:installment_id(policy:policy_id(owner_id))')
        .eq('payment_month', monthStartStr)
        .eq('is_cancelled', false);

      const userPayments = (payments || []).filter(
        (p: any) => p.installment?.policy?.owner_id === teamUser.id
      );

      const achieved = userPayments.reduce((sum: number, p: any) => sum + Number(p.amount), 0);

      performance.push({
        id: teamUser.id,
        name: teamUser.name,
        achieved,
        target: teamUser.target || 0
      });
    }

    setTeamPerformance(performance.sort((a, b) => b.achieved - a.achieved).slice(0, 5));
  };

  const loadChartData = async (userIds: string[]) => {
    const monthStart = startOfMonth(new Date());
    const monthStartStr = format(monthStart, 'yyyy-MM-dd');

    const { data: payments } = await supabase
      .from('payments')
      .select('amount, installment:installment_id(is_first, policy:policy_id(owner_id))')
      .eq('payment_month', monthStartStr)
      .eq('is_cancelled', false);

    const filteredPayments = (payments || []).filter(
      (p: any) => userIds.includes(p.installment?.policy?.owner_id)
    );

    const production = filteredPayments
      .filter((p: any) => p.installment?.is_first)
      .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

    const collection = filteredPayments
      .filter((p: any) => !p.installment?.is_first)
      .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

    setChartData({ production, collection });
  };

  const policyStatusData = stats
    ? [
        { name: 'نشط', value: stats.activePolicies, color: '#22c55e' },
        { name: 'موقوف', value: stats.suspendedPolicies, color: '#f59e0b' },
        { name: 'ملغى', value: stats.cancelledPolicies, color: '#ef4444' }
      ]
    : [];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency: 'EGP',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0
    }).format(amount);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-secondary-900">نظرة عامة</h2>
          <p className="text-sm text-secondary-500 mt-1">
            إحصائيات الشهر الحالي - {format(new Date(), 'MMMM yyyy', { locale: ar })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-secondary-500">العملاء</p>
              <p className="text-2xl font-bold text-secondary-900 mt-1">
                {stats?.totalCustomers || 0}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-info-100 flex items-center justify-center">
              <Users className="w-6 h-6 text-info-600" />
            </div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-secondary-500">الوثائق</p>
              <p className="text-2xl font-bold text-secondary-900 mt-1">
                {stats?.totalPolicies || 0}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-success-100 flex items-center justify-center">
              <FileText className="w-6 h-6 text-success-600" />
            </div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-secondary-500">الإنتاج الجديد</p>
              <p className="text-2xl font-bold text-secondary-900 mt-1">
                {formatCurrency(stats?.newProduction || 0)}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-warning-100 flex items-center justify-center">
              <TrendingUp className="w-6 h-6 text-warning-600" />
            </div>
          </div>
        </div>

        <div className="kpi-card">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-secondary-500">التحصيل الدوري</p>
              <p className="text-2xl font-bold text-secondary-900 mt-1">
                {formatCurrency(stats?.periodicCollection || 0)}
              </p>
            </div>
            <div className="w-12 h-12 rounded-xl bg-primary-100 flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-primary-600" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card">
          <h3 className="font-semibold text-secondary-900 mb-4">التارجت</h3>
          <div className="mb-6">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm text-secondary-600">نسبة الإنجاز</span>
              <span className="text-lg font-bold text-secondary-900">
                {stats?.achievementRate || 0}%
              </span>
            </div>
            <div className="w-full bg-secondary-200 rounded-full h-3">
              <div
                className="bg-primary-600 h-3 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, stats?.achievementRate || 0)}%` }}
              />
            </div>
            <div className="flex justify-between mt-2 text-sm text-secondary-500">
              <span>المحقق: {formatCurrency(stats?.achieved || 0)}</span>
              <span>التارجت: {formatCurrency(stats?.target || 0)}</span>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-success-50 rounded-lg">
              <CheckCircle className="w-8 h-8 text-success-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-success-700">
                {formatCurrency(stats?.achieved || 0)}
              </p>
              <p className="text-xs text-success-600 mt-1">المحقق</p>
            </div>
            <div className="text-center p-4 bg-warning-50 rounded-lg">
              <Target className="w-8 h-8 text-warning-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-warning-700">
                {formatCurrency(stats?.remaining || 0)}
              </p>
              <p className="text-xs text-warning-600 mt-1">المتبقي</p>
            </div>
            <div className="text-center p-4 bg-info-50 rounded-lg">
              <Clock className="w-8 h-8 text-info-600 mx-auto mb-2" />
              <p className="text-2xl font-bold text-info-700">
                {stats?.paidInstallmentsCount || 0}
              </p>
              <p className="text-xs text-info-600 mt-1">أقساط مسددة</p>
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold text-secondary-900 mb-4">حالة الوثائق</h3>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={policyStatusData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={70}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {policyStatusData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="flex justify-center gap-4 mt-2">
            {policyStatusData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-1">
                <div
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: entry.color }}
                />
                <span className="text-xs text-secondary-600">{entry.name}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 card">
          <h3 className="font-semibold text-secondary-900 mb-4">الإنتاج والتحصيل هذا الشهر</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={[
                    { name: 'الإنتاج الجديد', value: chartData.production, color: '#22c55e' },
                    { name: 'التحصيل الدوري', value: chartData.collection, color: '#3b82f6' }
                  ]}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, value }: any) => `${name}: ${formatCurrency(value)}`}
                >
                  <Cell fill="#22c55e" />
                  <Cell fill="#3b82f6" />
                </Pie>
                <Tooltip
                  formatter={(value: any) => formatCurrency(value)}
                  contentStyle={{
                    direction: 'rtl',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3 className="font-semibold text-secondary-900 mb-4">أداء الفريق</h3>
          <div className="space-y-4">
            {teamPerformance.length === 0 ? (
              <p className="text-center text-secondary-500 py-4">لا توجد بيانات</p>
            ) : (
              teamPerformance.map((member, index) => {
                const rate = member.target > 0
                  ? Math.round((member.achieved / member.target) * 100)
                  : 0;
                return (
                  <div key={member.id} className="flex items-center gap-3">
                    <div className="w-8 text-center">
                      <span className={clsx(
                        'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold',
                        index === 0 ? 'bg-warning-100 text-warning-700' :
                        index === 1 ? 'bg-secondary-200 text-secondary-700' :
                        'bg-secondary-100 text-secondary-600'
                      )}>
                        {index + 1}
                      </span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-medium text-secondary-900 truncate">
                          {member.name}
                        </span>
                        <span className="text-xs text-secondary-500">{rate}%</span>
                      </div>
                      <div className="w-full bg-secondary-200 rounded-full h-2">
                        <div
                          className={clsx(
                            'h-2 rounded-full transition-all duration-500',
                            rate >= 100 ? 'bg-success-500' :
                            rate >= 70 ? 'bg-warning-500' : 'bg-error-500'
                          )}
                          style={{ width: `${Math.min(100, rate)}%` }}
                        />
                      </div>
                      <div className="flex justify-between mt-1">
                        <span className="text-[10px] text-secondary-400">
                          {formatCurrency(member.achieved)}
                        </span>
                        <span className="text-[10px] text-secondary-400">
                          من {formatCurrency(member.target)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="kpi-card border-r-4 border-r-warning-500">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-8 h-8 text-warning-600" />
            <div>
              <p className="text-sm text-secondary-500">الأقساط المستحقة</p>
              <p className="text-xl font-bold text-secondary-900">
                {formatCurrency(stats?.dueInstallments || 0)}
              </p>
              <p className="text-xs text-secondary-400 mt-1">
                {stats?.dueInstallmentsCount || 0} قسط
              </p>
            </div>
          </div>
        </div>

        <div className="kpi-card border-r-4 border-r-error-500">
          <div className="flex items-center gap-3">
            <AlertCircle className="w-8 h-8 text-error-600" />
            <div>
              <p className="text-sm text-secondary-500">الأقساط المتأخرة</p>
              <p className="text-xl font-bold text-secondary-900">
                {formatCurrency(stats?.overdueInstallments || 0)}
              </p>
              <p className="text-xs text-secondary-400 mt-1">
                {stats?.overdueInstallmentsCount || 0} قسط
              </p>
            </div>
          </div>
        </div>

        <div className="kpi-card border-r-4 border-r-success-500">
          <div className="flex items-center gap-3">
            <CheckCircle className="w-8 h-8 text-success-600" />
            <div>
              <p className="text-sm text-secondary-500">الأقساط المسددة</p>
              <p className="text-xl font-bold text-secondary-900">
                {formatCurrency(stats?.paidInstallments || 0)}
              </p>
              <p className="text-xs text-secondary-400 mt-1">
                {stats?.paidInstallmentsCount || 0} قسط
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
