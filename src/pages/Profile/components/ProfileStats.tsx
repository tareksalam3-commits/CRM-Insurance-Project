import { TrendingUp, FileText, Users, Wallet } from 'lucide-react';
import type { ProfilePerformanceStats } from '../types';
import { formatCurrency } from '../utils';

interface ProfileStatsProps {
  stats: ProfilePerformanceStats | null;
  statsLoading: boolean;
}

export function ProfileStats({ stats, statsLoading }: ProfileStatsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {statsLoading ? (
        Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="kpi-card animate-pulse">
            <div className="h-3.5 w-24 bg-secondary-200 rounded" />
            <div className="h-6 w-16 bg-secondary-200 rounded mt-3" />
          </div>
        ))
      ) : (
        <>
          <div className="kpi-card border-r-4 border-r-primary-500">
            <div className="flex items-center justify-between">
              <p className="text-xs md:text-sm text-secondary-500">إجمالي المحقق هذا العام (أنت وفريقك)</p>
              <TrendingUp className="w-4 h-4 text-primary-500" />
            </div>
            <p className="text-xl md:text-2xl font-bold text-secondary-900 mt-1.5">{formatCurrency(stats?.yearTotalPaid || 0)}</p>
          </div>

          <div className="kpi-card border-r-4 border-r-info-500">
            <div className="flex items-center justify-between">
              <p className="text-xs md:text-sm text-secondary-500">وثائق مصدرة هذا العام (أنت وفريقك)</p>
              <FileText className="w-4 h-4 text-info-500" />
            </div>
            <p className="text-xl md:text-2xl font-bold text-secondary-900 mt-1.5">{stats?.policiesThisYearCount ?? 0}</p>
          </div>

          <div className="kpi-card border-r-4 border-r-success-500">
            <div className="flex items-center justify-between">
              <p className="text-xs md:text-sm text-secondary-500">عملاء نشطون (أنت وفريقك)</p>
              <Users className="w-4 h-4 text-success-500" />
            </div>
            <p className="text-xl md:text-2xl font-bold text-success-600 mt-1.5">{stats?.activeCustomersCount ?? 0}</p>
          </div>

          <div className="kpi-card border-r-4 border-r-warning-500">
            <div className="flex items-center justify-between">
              <p className="text-xs md:text-sm text-secondary-500">عمولات مستحقة هذا الشهر (إنتاجك الشخصي)</p>
              <Wallet className="w-4 h-4 text-warning-500" />
            </div>
            <p className="text-xl md:text-2xl font-bold text-warning-600 mt-1.5">{formatCurrency(stats?.commissionsThisMonth || 0)}</p>
          </div>
        </>
      )}
    </div>
  );
}
