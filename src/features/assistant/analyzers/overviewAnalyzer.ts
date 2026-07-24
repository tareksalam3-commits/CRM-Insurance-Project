import { supabase, User } from '../../../lib/supabase';
import { startOfMonth, format } from 'date-fns';
import { dalRead } from '../../../lib/dataAccessLayer';
import type { AssistantAnswer } from '../types';
import { formatCurrency } from '../helpers/formatters';
import { getScopedUserIds } from '../helpers/scopeHelpers';

/**
 * نظرة شاملة على كل المؤشرات الأساسية عبر كل الصفحات (وثائق، تحصيل،
 * مسدد/غير مسدد، إنتاج جديد، إلغاءات) في استدعاء واحد رخيص.
 *
 * ليه الدالة دي محتاجة:
 * قبل كده كل Intent كان بياخد شريحة ضيقة بس من البيانات (حسب تصنيف السؤال
 * محليًا)، فلو السؤال متصنّف غلط أو مفهوش نمط واضح، الذكاء الاصطناعي كان
 * بيرد من غير أي أرقام حقيقية. الدالة دي بترجع صورة شاملة "افتراضية" بتتضاف
 * مع كل سؤال (زي ما هو موضّح في aiContextService.ts) بغض النظر عن الـ Intent،
 * عشان الذكاء الاصطناعي يكون شايف الصورة الكاملة دايمًا، وبعدين الـ Intent
 * الخاص بالسؤال بيضيف تفاصيل إضافية فوقها لو محتاجة.
 *
 * كل الأرقام بتُحسب على نطاق التحليل الخاص بالمستخدم (getScopedUserIds /
 * assistant_scoped_*) - نفس الحماية المطبقة في باقي الملف.
 */
export async function getFullSystemOverview(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const monthStart = startOfMonth(new Date());
  const monthStartStr = format(monthStart, 'yyyy-MM-dd');

  interface OverviewRaw {
    policies: any[];
    pending: any[];
    overdue: any[];
    paymentsMonth: any[];
  }

  const raw = await dalRead<OverviewRaw>(
    `assistant:fullOverview:${userIds.slice().sort().join(',')}:${monthStartStr}`,
    async () => {
      const [policiesRes, pendingRes, overdueRes, paymentsMonthRes] = await Promise.all([
        supabase.rpc('assistant_scoped_policies'),
        supabase.rpc('assistant_scoped_installments', { p_status: 'pending' }),
        supabase.rpc('assistant_scoped_installments', { p_status: 'overdue' }),
        supabase.rpc('assistant_scoped_payments', { p_payment_month: monthStartStr })
      ]);
      if (policiesRes.error) throw policiesRes.error;
      if (pendingRes.error) throw pendingRes.error;
      if (overdueRes.error) throw overdueRes.error;
      if (paymentsMonthRes.error) throw paymentsMonthRes.error;

      return {
        policies: policiesRes.data || [],
        pending: pendingRes.data || [],
        overdue: overdueRes.data || [],
        paymentsMonth: paymentsMonthRes.data || []
      };
    },
    { emptyValue: { policies: [], pending: [], overdue: [], paymentsMonth: [] } }
  ).then((r) => r.data);

  const policies = raw.policies;
  const activePolicies = policies.filter((p: any) => p.status === 'active');
  const cancelledPolicies = policies.filter((p: any) => p.status === 'cancelled');
  const newPoliciesThisMonth = policies.filter((p: any) => new Date(p.created_at) >= monthStart);
  const cancellationRate = policies.length > 0 ? Math.round((cancelledPolicies.length / policies.length) * 100) : 0;

  // غير مسدد = مستحق لسه (pending) + متأخر (overdue) مجتمعين
  const pending = raw.pending;
  const overdue = raw.overdue;
  const pendingTotal = pending.reduce((s: number, i: any) => s + Number(i.amount), 0);
  const overdueTotal = overdue.reduce((s: number, i: any) => s + Number(i.amount), 0);
  const unpaidTotal = pendingTotal + overdueTotal;

  const paymentsMonth = raw.paymentsMonth;
  const collectionMonth = paymentsMonth
    .filter((p: any) => !p.is_first)
    .reduce((s: number, p: any) => s + Number(p.amount), 0);
  const productionMonth = paymentsMonth
    .filter((p: any) => p.is_first)
    .reduce((s: number, p: any) => s + Number(p.amount), 0);
  const paidTotalMonth = collectionMonth + productionMonth;

  return {
    title: '🧭 نظرة شاملة على كل المؤشرات',
    lines: [
      `إجمالي الوثائق: ${policies.length} (نشطة: ${activePolicies.length}, ملغاة: ${cancelledPolicies.length})`,
      `وثائق جديدة هذا الشهر: ${newPoliciesThisMonth.length}`,
      `نسبة الإلغاء: ${cancellationRate}%`,
      `إجمالي المسدد هذا الشهر: ${formatCurrency(paidTotalMonth)} (تحصيل دوري: ${formatCurrency(collectionMonth)} + إنتاج جديد: ${formatCurrency(productionMonth)})`,
      `إجمالي الغير مسدد حاليًا: ${formatCurrency(unpaidTotal)} (مستحق لاحقًا: ${formatCurrency(pendingTotal)} في ${pending.length} قسط، متأخر: ${formatCurrency(overdueTotal)} في ${overdue.length} قسط)`
    ]
  };
}
