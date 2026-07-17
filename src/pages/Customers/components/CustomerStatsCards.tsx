import { Users, UserCheck, Clock3, UserPlus } from 'lucide-react';
import type { CustomerStats } from '../services/customersService';
import { StatsCard } from '../../../components/ui/StatsCard';
import { StatsCardSkeleton } from '../../../components/feedback/StatsCardSkeleton';

interface CustomerStatsCardsProps {
  stats: CustomerStats | null;
  statsLoading: boolean;
}

export function CustomerStatsCards({ stats, statsLoading }: CustomerStatsCardsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {statsLoading ? (
        <StatsCardSkeleton count={4} valueWidthClass="w-14" />
      ) : (
        <>
          <StatsCard
            label="إجمالي العملاء"
            value={stats?.total ?? 0}
            icon={Users}
            borderClassName="border-r-4 border-r-primary-500"
            iconClassName="w-4 h-4 text-primary-500"
          />
          <StatsCard
            label="العملاء النشطون"
            value={stats?.active ?? 0}
            icon={UserCheck}
            borderClassName="border-r-4 border-r-success-500"
            iconClassName="w-4 h-4 text-success-500"
            valueClassName="text-xl md:text-2xl font-bold text-success-600 mt-1.5"
          />
          <StatsCard
            label="لديهم أقساط مستحقة"
            value={stats?.withDueInstallments ?? 0}
            icon={Clock3}
            borderClassName="border-r-4 border-r-warning-500"
            iconClassName="w-4 h-4 text-warning-500"
            valueClassName="text-xl md:text-2xl font-bold text-warning-600 mt-1.5"
          />
          <StatsCard
            label="عملاء جدد هذا الشهر"
            value={stats?.newThisMonth ?? 0}
            icon={UserPlus}
            borderClassName="border-r-4 border-r-info-500"
            iconClassName="w-4 h-4 text-info-500"
          />
        </>
      )}
    </div>
  );
}
