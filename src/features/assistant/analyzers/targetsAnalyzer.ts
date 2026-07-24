import { User } from '../../../lib/supabase';
import { startOfMonth, format } from 'date-fns';
import type { AssistantAnswer } from '../types';
import { formatCurrency } from '../helpers/formatters';
import { getScopedUserIds, getScopedTeamAchievement, getSubtreeUserIds, getSubtreeScopedPayments } from '../helpers/scopeHelpers';

/** كم المتبقي لتحقيق الهدف */
export async function getRemainingTarget(user: User): Promise<AssistantAnswer> {
  const subtreeIds = await getSubtreeUserIds(user);
  const monthStartStr = format(startOfMonth(new Date()), 'yyyy-MM-dd');

  const payments = await getSubtreeScopedPayments(subtreeIds, monthStartStr);
  const achieved = payments.reduce((s: number, p) => s + p.amount, 0);

  const target = Number(user.target || 0);
  const remaining = Math.max(0, target - achieved);
  const rate = target > 0 ? Math.round((achieved / target) * 100) : 0;

  return {
    title: '🎯 المتبقي لتحقيق الهدف',
    lines: [
      `الهدف الشهري: ${formatCurrency(target)}`,
      `المحقق حتى الآن: ${formatCurrency(achieved)} (${rate}%)`,
      `المتبقي: ${formatCurrency(remaining)}`
    ]
  };
}

/** نظرة عامة على نسبة تحقيق الأهداف لكل الفريق ضمن النطاق */
export async function getGoalsAchievementOverview(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const team = await getScopedTeamAchievement(userIds);
  const withTarget = team.filter((t) => t.target > 0);

  if (withTarget.length === 0) {
    return { title: '🎯 نسبة تحقيق الأهداف', lines: ['لا توجد أهداف محددة ضمن نطاقك حاليًا'] };
  }

  const rates = withTarget.map((t) => ({ ...t, rate: Math.round((t.achieved / t.target) * 100) }));
  const achieved100 = rates.filter((t) => t.rate >= 100).length;
  const below50 = rates.filter((t) => t.rate < 50).length;
  const avgRate = Math.round(rates.reduce((s, t) => s + t.rate, 0) / rates.length);

  return {
    title: '🎯 نسبة تحقيق الأهداف',
    lines: [
      `متوسط نسبة التحقيق للفريق: ${avgRate}%`,
      `حققوا الهدف بالكامل (100%+): ${achieved100} من ${withTarget.length}`,
      `أقل من 50% من الهدف حتى الآن: ${below50}`
    ]
  };
}
