import { Wallet, CheckCircle, Hash, Receipt } from 'lucide-react';
import type { CollectionQuickStats } from '../services/collectionService';
import { formatCurrency } from '../utils/formatCurrency';
import { StatsCard } from '../../../components/ui/StatsCard';
import { StatsCardSkeleton } from '../../../components/feedback/StatsCardSkeleton';

interface CollectionStatsProps {
  quickStats: CollectionQuickStats | null;
  quickStatsLoading: boolean;
}

// ===== بطاقات إحصائية سريعة (لحظية من Supabase) =====
export function CollectionStats({ quickStats, quickStatsLoading }: CollectionStatsProps) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
      {quickStatsLoading ? (
        <StatsCardSkeleton count={4} valueWidthClass="w-16" />
      ) : (
        <>
          <StatsCard
            label="المستحق"
            value={formatCurrency(quickStats?.dueMonthAmount || 0)}
            icon={Wallet}
            borderClassName="border-r-4 border-r-warning-500"
            iconClassName="w-4 h-4 text-warning-500 shrink-0"
            valueClassName="text-lg md:text-2xl font-bold text-secondary-900 mt-1.5 truncate"
            footer={
              <p className="text-[11px] md:text-xs text-secondary-400 mt-1 truncate">
                من إجمالي {formatCurrency(quickStats?.totalDueMonthAmount || 0)}
              </p>
            }
          />
          <StatsCard
            label="محصَّل اليوم"
            value={formatCurrency(quickStats?.collectedTodayAmount || 0)}
            icon={CheckCircle}
            borderClassName="border-r-4 border-r-success-500"
            iconClassName="w-4 h-4 text-success-500 shrink-0"
            valueClassName="text-lg md:text-2xl font-bold text-success-600 mt-1.5 truncate"
          />
          <StatsCard
            label="إجمالي المسدد خلال الشهر الحالي"
            value={formatCurrency(quickStats?.collectedMonthAmount || 0)}
            icon={Hash}
            borderClassName="border-r-4 border-r-primary-500"
            iconClassName="w-4 h-4 text-primary-500 shrink-0"
            valueClassName="text-lg md:text-2xl font-bold text-secondary-900 mt-1.5 truncate"
          />
          <StatsCard
            label="أقساط محصلة اليوم"
            value={quickStats?.collectedTodayCount ?? 0}
            icon={Receipt}
            borderClassName="border-r-4 border-r-info-500"
            iconClassName="w-4 h-4 text-info-500 shrink-0"
            valueClassName="text-lg md:text-2xl font-bold text-secondary-900 mt-1.5"
          />
        </>
      )}
    </div>
  );
}
