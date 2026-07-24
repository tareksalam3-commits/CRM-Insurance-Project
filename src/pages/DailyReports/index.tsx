import { useState } from 'react';
import { ClipboardList, Users } from 'lucide-react';

import { PageHeader } from '../../components/layout/PageHeader';
import { useAuth } from '../../hooks/useAuth';
import { useBranchContext } from '../../lib/branchContext';
import { getRoleLevel, canEnterDailyAgentStats, ROLE_LABELS } from '../../lib/supabase';

import { StatsEntryForm } from './components/StatsEntryForm';
import { TeamStatsView } from './components/TeamStatsView';
import { AgentOwnStatsView } from './components/AgentOwnStatsView';

type GroupLeaderTab = 'entry' | 'team';

export function DailyReports() {
  const { user } = useAuth();
  const { currentBranchId } = useBranchContext();
  const [groupLeaderTab, setGroupLeaderTab] = useState<GroupLeaderTab>('entry');

  if (!user) return null;

  const roleLevel = getRoleLevel(user.role);

  // إيجنت: يشوف إحصائياته الشخصية فقط (المدخلة من رئيس مجموعته)، بدون أي
  // إدخال من عنده — التقرير الورقي يُسلَّم خارج التطبيق
  if (user.role === 'agent') {
    return (
      <div className="space-y-4">
        <PageHeader title="إحصائياتي اليومية" subtitle="الإحصائيات المسجّلة من رئيس مجموعتك بعد استلام تقريرك الورقي" />
        <AgentOwnStatsView agentId={user.id} roleLevel={roleLevel} />
      </div>
    );
  }

  // رئيس المجموعة: إدخال يومي لفريقه + إحصائيات الفريق المجمّعة (مع النزول
  // لأي فرد بعينه)
  if (canEnterDailyAgentStats(user.role)) {
    return (
      <div className="space-y-4">
        <div className="print:hidden">
          <PageHeader title="تقارير العمل اليومية" subtitle="إدخال إحصائيات فريقك بعد استلام التقرير الورقي، ومتابعة إحصائياتهم المجمّعة" />
        </div>

        <div className="flex gap-2 border-b border-secondary-100 print:hidden">
          <button
            onClick={() => setGroupLeaderTab('entry')}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              groupLeaderTab === 'entry'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-secondary-500 hover:text-secondary-700'
            }`}
          >
            <ClipboardList className="w-4 h-4" /> إدخال الإحصائيات اليومية
          </button>
          <button
            onClick={() => setGroupLeaderTab('team')}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              groupLeaderTab === 'team'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-secondary-500 hover:text-secondary-700'
            }`}
          >
            <Users className="w-4 h-4" /> إحصائيات الفريق
          </button>
        </div>

        {groupLeaderTab === 'entry' ? (
          <StatsEntryForm />
        ) : (
          <TeamStatsView userId={user.id} viewerName={user.name} viewerRoleLabel={ROLE_LABELS[user.role]} roleLevel={roleLevel} branchId={currentBranchId} />
        )}
      </div>
    );
  }

  // المراقب / المراقب العام / مدير التطوير / مدير النظام: إحصائيات مجمّعة
  // لكامل نطاقهم الإداري، مع إمكانية النزول لأي مجموعة أو فرد بعينه
  return (
    <div className="space-y-4">
      <div className="print:hidden">
        <PageHeader title="تقارير العمل اليومية" subtitle="إحصائيات فرقك المجمّعة، مع إمكانية النزول لأي مجموعة أو فرد بعينه" />
      </div>
      <TeamStatsView userId={user.id} viewerName={user.name} viewerRoleLabel={ROLE_LABELS[user.role]} roleLevel={roleLevel} branchId={currentBranchId} />
    </div>
  );
}
