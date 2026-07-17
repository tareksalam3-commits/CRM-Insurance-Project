import { Users, UserCog } from 'lucide-react';
import { StatsCard } from '../../../components/ui/StatsCard';
import { getRoleLevel, type UserRole } from '../../../lib/supabase';

// ─── إحصائيات سريعة ──────────────────────────────────────
// كل بطاقة إحصائية بتخص درجة وظيفية أعلى من المستخدم الحالي بتتخفى بالكامل
// (بدل ما تظهر برقم 0)، لأن نطاقه الإداري أصلاً مايشملش هذه الدرجة.
export function OrgStats({
  stats,
  currentUserRole,
}: {
  stats: { total: number; generalSupervisors: number; supervisors: number; groupLeaders: number; agents: number };
  currentUserRole: UserRole;
}) {
  const myLevel = getRoleLevel(currentUserRole);

  return (
    <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 md:gap-4">
      <StatsCard
        label="إجمالي المستخدمين"
        value={stats.total}
        icon={Users}
        borderClassName="border-r-4 border-r-secondary-400"
        iconClassName="w-4 h-4 text-secondary-500 shrink-0"
      />
      {myLevel <= 3 && (
        <StatsCard
          label="المراقبون العموم"
          value={stats.generalSupervisors}
          icon={UserCog}
          borderClassName="border-r-4 border-r-warning-500"
          iconClassName="w-4 h-4 text-warning-500 shrink-0"
        />
      )}
      {myLevel <= 4 && (
        <StatsCard
          label="المراقبون"
          value={stats.supervisors}
          icon={UserCog}
          borderClassName="border-r-4 border-r-primary-500"
          iconClassName="w-4 h-4 text-primary-500 shrink-0"
        />
      )}
      {myLevel <= 5 && (
        <StatsCard
          label="رؤساء المجموعات"
          value={stats.groupLeaders}
          icon={Users}
          borderClassName="border-r-4 border-r-info-500"
          iconClassName="w-4 h-4 text-info-500 shrink-0"
        />
      )}
      <StatsCard
        label="الوكلاء"
        value={stats.agents}
        icon={Users}
        borderClassName="border-r-4 border-r-success-500"
        iconClassName="w-4 h-4 text-success-500 shrink-0"
      />
    </div>
  );
}
