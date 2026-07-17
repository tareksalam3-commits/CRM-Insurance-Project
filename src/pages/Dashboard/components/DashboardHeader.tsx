import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { getDailyMessage } from '../../../lib/dailyMessages';
import type { User } from '../../../lib/supabase';

interface DashboardHeaderProps {
  user: User | null | undefined;
}

export function DashboardHeader({ user }: DashboardHeaderProps) {
  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-secondary-900">نظرة عامة</h2>
          <p className="text-sm text-secondary-500 mt-0.5">
            إحصائيات الشهر الحالي - {format(new Date(), 'MMMM yyyy', { locale: ar })}
          </p>
        </div>
      </div>

      {user && (
        <div className="card bg-primary-50/60 border border-primary-100 py-3 px-4 flex items-start gap-2">
          <span className="text-lg leading-none">💡</span>
          <div>
            <p className="text-xs font-semibold text-primary-700">رسالة اليوم</p>
            <p className="text-sm text-secondary-700 mt-0.5 leading-snug">
              {getDailyMessage(user.role)}
            </p>
          </div>
        </div>
      )}
    </>
  );
}
