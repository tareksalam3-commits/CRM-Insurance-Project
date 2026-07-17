import { User } from '../../../lib/supabase';
import type { AssistantAnswer } from '../types';
import { formatCurrency } from '../helpers/formatters';
import { getScopedUserIds, getScopedTeamAchievement } from '../helpers/scopeHelpers';

/** أفضل / أقل الوكلاء */
export async function getAgentsRanking(user: User, direction: 'top' | 'bottom', count = 5): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const team = await getScopedTeamAchievement(userIds);
  const agentsOnly = team.filter((t) => t.role === 'agent' || t.role === 'premium_agent');

  const sorted = [...agentsOnly].sort((a, b) =>
    direction === 'top' ? b.achieved - a.achieved : a.achieved - b.achieved
  );
  const picked = sorted.slice(0, count);

  return {
    title: direction === 'top' ? `👑 أفضل ${count} وكلاء` : `📉 أقل ${count} وكلاء`,
    lines:
      picked.length === 0
        ? ['لا توجد بيانات كافية']
        : picked.map((a, idx) => `${idx + 1}. ${a.name} - ${formatCurrency(a.achieved)}`)
  };
}

/** عدد الوكلاء (الإجمالي ضمن نطاق رؤية المستخدم) */
export async function getAgentsCount(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const team = await getScopedTeamAchievement(userIds);
  const agentsOnly = team.filter((t) => t.role === 'agent' || t.role === 'premium_agent');

  return {
    title: '👥 عدد الوكلاء',
    lines: [`إجمالي عدد الوكلاء: ${agentsOnly.length}`]
  };
}

/** أداء رؤساء المجموعات */
export async function getGroupLeadersPerformance(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const team = await getScopedTeamAchievement(userIds);
  const groupLeaders = team
    .filter((t) => t.role === 'group_leader')
    .sort((a, b) => b.achieved - a.achieved);

  return {
    title: '📈 أداء رؤساء المجموعات',
    lines:
      groupLeaders.length === 0
        ? ['لا يوجد رؤساء مجموعات ضمن نطاقك']
        : groupLeaders.map((g) => {
            const rate = g.target > 0 ? Math.round((g.achieved / g.target) * 100) : 0;
            return `${g.name}: ${formatCurrency(g.achieved)} (${rate}%)`;
          })
  };
}

/** أداء المراقبين (Supervisors) ضمن نطاق رؤية المستخدم */
export async function getSupervisorsPerformance(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const team = await getScopedTeamAchievement(userIds);
  const supervisors = team.filter((t) => t.role === 'supervisor').sort((a, b) => b.achieved - a.achieved);

  return {
    title: '📈 أداء المراقبين',
    lines:
      supervisors.length === 0
        ? ['لا يوجد مراقبون ضمن نطاقك']
        : supervisors.map((s) => {
            const rate = s.target > 0 ? Math.round((s.achieved / s.target) * 100) : 0;
            return `${s.name}: ${formatCurrency(s.achieved)} (${rate}%)`;
          })
  };
}

/** أداء المراقبين العامين (General Supervisors) ضمن نطاق رؤية المستخدم */
export async function getGeneralSupervisorsPerformance(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const team = await getScopedTeamAchievement(userIds);
  const generalSupervisors = team
    .filter((t) => t.role === 'general_supervisor')
    .sort((a, b) => b.achieved - a.achieved);

  return {
    title: '📈 أداء المراقبين العامين',
    lines:
      generalSupervisors.length === 0
        ? ['لا يوجد مراقبون عامون ضمن نطاقك']
        : generalSupervisors.map((s) => {
            const rate = s.target > 0 ? Math.round((s.achieved / s.target) * 100) : 0;
            return `${s.name}: ${formatCurrency(s.achieved)} (${rate}%)`;
          })
  };
}

/**
 * اكتشاف أعضاء الفريق اللي أداؤهم أقل بوضوح من المسار الطبيعي المتوقع في
 * الشهر (بمقارنة نسبة تحقيقهم بنسبة الأيام اللي عدّت من الشهر) - بديل محلي
 * بسيط عن "تحليل انخفاض الأداء" بدون أي نموذج ذكاء اصطناعي خارجي
 */
export async function getUnderperformingTeam(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const team = await getScopedTeamAchievement(userIds);
  const withTarget = team.filter((t) => t.target > 0 && t.id !== user.id);

  const now = new Date();
  const dayOfMonth = now.getDate();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const expectedProgress = dayOfMonth / daysInMonth;

  const lagging = withTarget
    .map((t) => ({ ...t, rate: t.achieved / t.target }))
    .filter((t) => t.rate < expectedProgress * 0.6)
    .sort((a, b) => a.rate - b.rate)
    .slice(0, 10);

  return {
    title: '⚠️ محتاجين متابعة',
    lines:
      lagging.length === 0
        ? ['كل أعضاء الفريق في المسار الصحيح لتحقيق أهدافهم 👍']
        : lagging.map(
            (t) => `- ${t.name}: حقق ${Math.round(t.rate * 100)}% فقط (المتوقع بحلول اليوم ~${Math.round(expectedProgress * 100)}%)`
          )
  };
}
