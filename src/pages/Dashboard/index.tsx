import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { type UserRole } from '../../lib/supabase';
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
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ar } from 'date-fns/locale';
import { getDailyMessage } from '../../lib/dailyMessages';
import {
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

import type { DashboardStats, TeamPerformance } from './types';
import {
  fetchUserSubtreeIds, fetchDashboardRawData, fetchTeamUsers,
  fetchMonthPayments, fetchMonthPaymentsWithFirstFlag, getCurrentMonthStartStr,
} from './services/dashboardService';
import { computeDashboardStats, computeTeamPerformance, computeChartData } from './business/dashboardCalculator';

export function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [teamPerformance, setTeamPerformance] = useState<TeamPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<{ production: number; collection: number }>({ production: 0, collection: 0 });

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

      const userIds = await fetchUserSubtreeIds(user!.id);

      const { customersRes, policiesRes, installmentsRes, paymentsRes } =
        await fetchDashboardRawData(userIds, monthStartStr);

      const policies = policiesRes.data || [];

      setStats(computeDashboardStats({
        customersCount: customersRes.count || 0,
        policies,
        installmentsRaw: installmentsRes.data || [],
        paymentsRaw: paymentsRes.data || [],
        userIds,
        monthStart,
        monthEnd,
        target: user?.target || 0,
      }));

      await loadTeamPerformance(userIds);
      await loadChartData(userIds);
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadTeamPerformance = async (userIds: string[]) => {
    const monthStartStr = getCurrentMonthStartStr();

    const teamUsers = await fetchTeamUsers(userIds);
    if (teamUsers.length === 0) return;

    const payments = await fetchMonthPayments(monthStartStr);

    setTeamPerformance(computeTeamPerformance(teamUsers, payments, user?.role as UserRole | undefined));
  };

  const loadChartData = async (userIds: string[]) => {
    const monthStartStr = getCurrentMonthStartStr();
    const payments = await fetchMonthPaymentsWithFirstFlag(monthStartStr);
    setChartData(computeChartData(payments, userIds));
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
      <div className="space-y-6 animate-fadeIn">
        <div className="mb-6">
          <div className="h-6 w-32 bg-secondary-200 rounded-md animate-pulse" />
          <div className="h-4 w-48 bg-secondary-100 rounded-md animate-pulse mt-2" />
        </div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="kpi-card">
              <div className="flex items-center justify-between">
                <div className="space-y-2">
                  <div className="h-3 w-16 bg-secondary-100 rounded animate-pulse" />
                  <div className="h-6 w-20 bg-secondary-200 rounded animate-pulse" />
                </div>
                <div className="w-12 h-12 rounded-xl bg-secondary-100 animate-pulse" />
              </div>
            </div>
          ))}
        </div>
        <div className="card">
          <div className="h-4 w-24 bg-secondary-200 rounded animate-pulse mb-4" />
          <div className="h-3 w-full bg-secondary-100 rounded-full animate-pulse mb-6" />
          <div className="grid grid-cols-3 gap-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-24 bg-secondary-50 rounded-lg animate-pulse" />
            ))}
          </div>
        </div>
        <div className="card">
          <div className="h-4 w-24 bg-secondary-200 rounded animate-pulse mb-4" />
          <div className="space-y-4">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-8 bg-secondary-50 rounded animate-pulse" />
            ))}
          </div>
        </div>
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

      {user && (
        <div className="card bg-primary-50/60 border border-primary-100 py-3 px-4 flex items-start gap-2 mb-6">
          <span className="text-lg leading-none">💡</span>
          <div>
            <p className="text-xs font-semibold text-primary-700">رسالة اليوم</p>
            <p className="text-sm text-secondary-700 mt-0.5 leading-snug">
              {getDailyMessage(user.role)}
            </p>
          </div>
        </div>
      )}

      {stats && stats.totalPolicies === 0 && stats.totalCustomers === 0 && (
        <div className="card bg-secondary-50/60 border-dashed flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-secondary-100 flex items-center justify-center flex-shrink-0">
            <TrendingUp className="w-6 h-6 text-secondary-400" />
          </div>
          <div>
            <p className="text-sm font-medium text-secondary-700">لا يوجد نشاط مسجل بعد هذا الشهر</p>
            <p className="text-xs text-secondary-500 mt-0.5">
              ابدأ بإضافة عميل أو وثيقة جديدة وستظهر إحصائياتك هنا تلقائيًا
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <button
          type="button"
          onClick={() => navigate('/customers')}
          className="kpi-card text-right w-full cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
        >
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
        </button>

        <button
          type="button"
          onClick={() => navigate('/policies')}
          className="kpi-card text-right w-full cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
        >
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
        </button>

        <button
          type="button"
          onClick={() => navigate('/collection?tab=new_production')}
          className="kpi-card text-right w-full cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
        >
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
        </button>

        <button
          type="button"
          onClick={() => navigate('/collection?tab=periodic')}
          className="kpi-card text-right w-full cursor-pointer hover:-translate-y-0.5 active:translate-y-0"
        >
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
        </button>
      </div>

      <div className="card">
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

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="card">
          <h3 className="font-semibold text-secondary-900 mb-4">حالة الوثائق</h3>
          <div className="h-48 relative">
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
                <Tooltip
                  formatter={(value: any, name: any) => [value, name]}
                  contentStyle={{
                    direction: 'rtl',
                    borderRadius: '8px',
                    border: '1px solid #e2e8f0'
                  }}
                />
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-xl font-bold text-secondary-900">
                {stats?.totalPolicies || 0}
              </span>
              <span className="text-[10px] text-secondary-400">إجمالي</span>
            </div>
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

        <div className="card">
          <h3 className="font-semibold text-secondary-900 mb-4">الإنتاج والتحصيل هذا الشهر</h3>

          <div className="flex items-center justify-center gap-2 mb-3">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: '#22c55e' }} />
            <span className="text-sm font-medium text-secondary-700">
              الإنتاج الجديد: {formatCurrency(chartData.production)}
            </span>
          </div>

          <div className="h-56 relative">
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
                  innerRadius={55}
                  outerRadius={85}
                  paddingAngle={2}
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
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-lg font-bold text-secondary-900">
                {formatCurrency(chartData.production + chartData.collection)}
              </span>
              <span className="text-[10px] text-secondary-400">الإجمالي</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-2 mt-3">
            <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: '#3b82f6' }} />
            <span className="text-sm font-medium text-secondary-700">
              التحصيل الدوري: {formatCurrency(chartData.collection)}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
