import { User, ROLE_LABELS, supabase } from '../../../lib/supabase';
import { dalRead } from '../../../lib/dataAccessLayer';
import type { AssistantAnswer } from '../types';
import { formatCurrency } from '../helpers/formatters';
import { getScopedUserIds, getScopedTeamAchievement } from '../helpers/scopeHelpers';

/**
 * لقطة من الهيكل الوظيفي الفعلي (مين تحت مين، ودرجة كل شخص) ضمن نطاق
 * التحليل الخاص بالمستخدم - بأسماء حقيقية مش وصف عام.
 *
 * ليه الدالة دي محتاجة: المؤشرات التانية بترجع "role" كنص إنجليزي خام
 * (زي 'group_leader') و"manager_id" كمعرّف، وده مش كافي للذكاء الاصطناعي
 * يفهم بيه شكل الهيكل الوظيفي الحقيقي أو يجاوب على أسئلة زي "مين تحت
 * فلان؟" أو "فلان درجته ايه؟". الدالة دي بتحوّلهم لأسماء ودرجات وعلاقات
 * مدير/مرؤوس مفهومة، وبتترفق كجزء من نظرة النظام الشاملة (getFullSystemOverview)
 * عشان تبقى موجودة مع أي سؤال بغض النظر عن تصنيفه.
 */
export async function getOrgStructureSnapshot(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);

  const teamUsers = await dalRead(
    `assistant:orgStructure:${userIds.slice().sort().join(',')}`,
    async () => {
      const { data, error } = await supabase.rpc('assistant_scoped_users');
      if (error) throw error;
      return (data || []) as any[];
    },
    { emptyValue: [] as any[] },
  ).then((r) => r.data);

  const nameById = new Map<string, string>(teamUsers.map((u: any) => [u.id, u.name]));
  // لو مديره المباشر مش ضمن نطاق التحليل (مثلاً هو نفسه أعلى نقطة في
  // النطاق)، على الأقل نعرض اسمه ودرجته من بيانات المستخدم الحالي.
  nameById.set(user.id, user.name);

  const activeUsers = teamUsers.filter((u: any) => u.is_active);

  const roleOrder: string[] = [
    'super_admin', 'development_manager', 'general_supervisor',
    'supervisor', 'group_leader', 'agent', 'premium_agent'
  ];

  const sorted = [...activeUsers].sort(
    (a: any, b: any) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role)
  );

  const lines = sorted.map((u: any) => {
    const roleLabel = ROLE_LABELS[u.role as keyof typeof ROLE_LABELS] || u.role;
    const managerName = u.manager_id ? nameById.get(u.manager_id) : null;
    const managerPart = managerName ? ` (تحت إشراف: ${managerName})` : '';
    const selfTag = u.id === user.id ? ' [أنت]' : '';
    return `- ${u.name}${selfTag}: ${roleLabel}${managerPart}`;
  });

  // كابّ الحجم لو النطاق كبير جدًا (مثلاً مدير فرع بيشرف على فرع كامل)،
  // عشان منضخّمش سياق كل سؤال بلا داعي - المدراء والقيادات دايمًا في
  // أول الترتيب (roleOrder) فبيفضلوا ظاهرين، والباقي بيتلخّص برقم.
  const MAX_LINES = 60;
  const cappedLines =
    lines.length > MAX_LINES
      ? [...lines.slice(0, MAX_LINES), `... و${lines.length - MAX_LINES} عضو آخر ضمن نطاقك (الأسماء الكاملة متاحة في صفحة الهيكل الوظيفي)`]
      : lines;

  return {
    title: '🧩 الهيكل الوظيفي ضمن نطاقك',
    lines: cappedLines.length === 0 ? ['لا يوجد أعضاء فريق ضمن نطاقك حاليًا'] : cappedLines
  };
}

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
