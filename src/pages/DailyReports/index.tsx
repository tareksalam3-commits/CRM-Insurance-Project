import { useState } from 'react';
import { ClipboardList, Users, MapPin, BarChart3 } from 'lucide-react';

import { PageHeader } from '../../components/layout/PageHeader';
import { useAuth } from '../../hooks/useAuth';
import { useBranchContext } from '../../lib/branchContext';
import { getRoleLevel, canEnterDailyAgentStats, ROLE_LABELS } from '../../lib/supabase';

import { StatsEntryForm } from './components/StatsEntryForm';
import { TeamStatsView } from './components/TeamStatsView';
import { AgentOwnStatsView } from './components/AgentOwnStatsView';
import { AgentAppointmentsView } from './components/AgentAppointmentsView';

type GroupLeaderTab = 'entry' | 'team';
type AgentTab = 'appointments' | 'stats';

export function DailyReports() {
  const { user } = useAuth();
  const { currentBranchId } = useBranchContext();
  const [groupLeaderTab, setGroupLeaderTab] = useState<GroupLeaderTab>('entry');
  const [agentTab, setAgentTab] = useState<AgentTab>('appointments');

  if (!user) return null;

  const roleLevel = getRoleLevel(user.role);

  // الوسيط الحر (premium_agent): مالوش رئيس مجموعة يدخل له، فهو نفسه بيدخل
  // مواعيده ويثبت موقعه عليها — لا يشترك فى نظام إحصائيات daily_agent_stats
  if (user.role === 'premium_agent') {
    return (
      <div className="space-y-4">
        <PageHeader title="مواعيدي" subtitle="سجّل مواعيدك، وثبّت موقعك عند وصولك لكل معاد" />
        <AgentAppointmentsView agentId={user.id} canAddOwn />
      </div>
    );
  }

  // إيجنت: يشوف إحصائياته الشخصية (المدخلة من رئيس مجموعته، بدون أي إدخال
  // من عنده لها — التقرير الورقي يُسلَّم خارج التطبيق)، ومواعيده اللي
  // دخّلها رئيس مجموعته صباحاً، مع تثبيت موقعه بنفسه عند وصوله لكل معاد
  if (user.role === 'agent') {
    return (
      <div className="space-y-4">
        <PageHeader title="تقاريري اليومية" subtitle="مواعيدك المسجّلة وتثبيت موقعك عليها، وإحصائياتك المسجّلة من رئيس مجموعتك" />

        <div className="flex gap-2 border-b border-secondary-100">
          <button
            onClick={() => setAgentTab('appointments')}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              agentTab === 'appointments'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-secondary-500 hover:text-secondary-700'
            }`}
          >
            <MapPin className="w-4 h-4" /> مواعيدي
          </button>
          <button
            onClick={() => setAgentTab('stats')}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors ${
              agentTab === 'stats'
                ? 'border-primary-600 text-primary-700'
                : 'border-transparent text-secondary-500 hover:text-secondary-700'
            }`}
          >
            <BarChart3 className="w-4 h-4" /> إحصائياتي
          </button>
        </div>

        {agentTab === 'appointments' ? (
          <AgentAppointmentsView agentId={user.id} canAddOwn={false} />
        ) : (
          <AgentOwnStatsView agentId={user.id} roleLevel={roleLevel} />
        )}
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
