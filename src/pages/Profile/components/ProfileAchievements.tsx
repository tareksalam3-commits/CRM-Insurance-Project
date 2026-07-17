import { Target } from 'lucide-react';
import clsx from 'clsx';
import type { User } from '../../../lib/supabase';
import type { ProfilePerformanceStats } from '../types';
import { formatCurrency } from '../utils';

interface ProfileAchievementsProps {
  user: User | null;
  stats: ProfilePerformanceStats | null;
  statsLoading: boolean;
  monthlyAchievementRate: number | null;
}

export function ProfileAchievements({ user, stats, statsLoading, monthlyAchievementRate }: ProfileAchievementsProps) {
  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-primary-50 rounded-lg text-primary-600">
          <Target className="w-5 h-5" />
        </div>
        <div>
          <h3 className="text-sm font-bold text-secondary-900">نسبة تحقيق الشهر الحالي</h3>
          <p className="text-xs text-secondary-500">إجمالي الأقساط المسددة هذا الشهر (أنت وفريقك) مقابل الهدف الشهري</p>
        </div>
      </div>

      {statsLoading ? (
        <div className="h-3 w-full bg-secondary-100 rounded-full animate-pulse" />
      ) : !user?.target ? (
        <p className="text-sm text-secondary-500 py-2">لا يوجد هدف شهري محدد لحسابك حتى الآن</p>
      ) : (
        <>
          <div className="flex items-center justify-between mb-2">
            <span className="text-2xl font-bold text-secondary-900">{monthlyAchievementRate}%</span>
            <span className="text-xs text-secondary-500">
              {formatCurrency(stats?.monthTotalPaid || 0)} من {formatCurrency(user.target)}
            </span>
          </div>
          <div className="h-3 w-full bg-secondary-100 rounded-full overflow-hidden">
            <div
              className={clsx(
                'h-full rounded-full transition-all duration-500',
                (monthlyAchievementRate || 0) >= 100 ? 'bg-success-500' :
                (monthlyAchievementRate || 0) >= 70 ? 'bg-warning-500' : 'bg-error-500'
              )}
              style={{ width: `${Math.min(100, monthlyAchievementRate || 0)}%` }}
            />
          </div>
        </>
      )}
    </div>
  );
}
