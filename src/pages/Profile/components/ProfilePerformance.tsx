import { AlertTriangle } from 'lucide-react';
import type { User } from '../../../lib/supabase';
import type { ProfilePerformanceStats } from '../types';
import { ProfileStats } from './ProfileStats';
import { ProfileAchievements } from './ProfileAchievements';

interface ProfilePerformanceProps {
  user: User | null;
  stats: ProfilePerformanceStats | null;
  statsLoading: boolean;
  statsError: string | null;
  monthlyAchievementRate: number | null;
}

export function ProfilePerformance({ user, stats, statsLoading, statsError, monthlyAchievementRate }: ProfilePerformanceProps) {
  return (
    <>
      {statsError ? (
        <div className="card bg-error-50 border-error-100 text-error-700 flex items-center gap-3 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          {statsError}
        </div>
      ) : (
        <div className="space-y-4 md:space-y-5">
          <ProfileStats stats={stats} statsLoading={statsLoading} />
          <ProfileAchievements
            user={user}
            stats={stats}
            statsLoading={statsLoading}
            monthlyAchievementRate={monthlyAchievementRate}
          />
        </div>
      )}
    </>
  );
}
