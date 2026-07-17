import { useNavigate } from 'react-router-dom';
import { Users, FileText, TrendingUp, DollarSign } from 'lucide-react';
import type { DashboardStats as DashboardStatsType } from '../types';
import { formatCurrency } from '../utils';
import { StatsCard } from '../../../components/ui/StatsCard';

interface DashboardStatsProps {
  stats: DashboardStatsType | null;
}

export function DashboardStats({ stats }: DashboardStatsProps) {
  const navigate = useNavigate();

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      <StatsCard
        label="العملاء"
        value={stats?.totalCustomers || 0}
        icon={Users}
        borderClassName="border-r-4 border-r-info-500"
        iconClassName="w-4 h-4 text-info-500 shrink-0"
        onClick={() => navigate('/customers')}
      />

      <StatsCard
        label="الوثائق"
        value={stats?.totalPolicies || 0}
        icon={FileText}
        borderClassName="border-r-4 border-r-success-500"
        iconClassName="w-4 h-4 text-success-500 shrink-0"
        valueClassName="text-xl md:text-2xl font-bold text-success-600 mt-1.5"
        onClick={() => navigate('/policies')}
      />

      <StatsCard
        label="الإنتاج الجديد"
        value={formatCurrency(stats?.newProduction || 0)}
        icon={TrendingUp}
        borderClassName="border-r-4 border-r-warning-500"
        iconClassName="w-4 h-4 text-warning-500 shrink-0"
        valueClassName="text-lg md:text-2xl font-bold text-secondary-900 mt-1.5 truncate"
        footer={
          <p className="text-[11px] md:text-xs text-secondary-400 mt-1 truncate">
            من إجمالي {formatCurrency(stats?.newProductionTotal || 0)}
          </p>
        }
        onClick={() => navigate('/collection?tab=new_production')}
      />

      <StatsCard
        label="التحصيل الدوري"
        value={formatCurrency(stats?.periodicCollection || 0)}
        icon={DollarSign}
        borderClassName="border-r-4 border-r-primary-500"
        iconClassName="w-4 h-4 text-primary-500 shrink-0"
        valueClassName="text-lg md:text-2xl font-bold text-secondary-900 mt-1.5 truncate"
        footer={
          <p className="text-[11px] md:text-xs text-secondary-400 mt-1 truncate">
            من إجمالي {formatCurrency(stats?.periodicCollectionTotal || 0)}
          </p>
        }
        onClick={() => navigate('/collection?tab=periodic')}
      />
    </div>
  );
}
