import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { POLICY_TYPE_LABELS, POLICY_STATUS_LABELS } from '../../../lib/supabase';
import type { CancellationSummary } from '../../Cancellations/types';
import type { DailyAgentStatRow } from '../../DailyReports/types';
import { aggregateEntries } from '../../DailyReports/services/dailyStatsService';
import { computeActivityScore, computeFinalScore, type ActivityTargets, type ActivityScoreResult } from './performanceScoreCalculator';

// عرض واضح لمؤشر جودة المواعيد: نسبة مئوية + تصنيف نصي (بدل الاكتفاء بعرض
// الأعداد الخام لكل تصنيف اللي مكانتش بتوضح المستوى الفعلي بنظرة واحدة).
// '-' لو مفيش بيانات نشاط مسجَّلة أصلاً، و'لا توجد مواعيد مقيَّمة' لو فيه
// بيانات نشاط لكن محدش قيّم مواعيده فى الفترة دي تحديداً.
function formatQualityIndicator(activity: ActivityScoreResult): string {
  if (!activity.hasData) return '-';
  if (activity.appointmentsQualityTotal === 0 || activity.appointmentsQualityScore === null) {
    return 'لا توجد مواعيد مقيَّمة';
  }
  return `${activity.appointmentsQualityScore}% (${activity.appointmentsQualityLabel})`;
}

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 0
  }).format(amount);
};

export function computeCustomersReport(customers: any[]) {
  const byMonth: Record<string, number> = {};
  customers.forEach((c: any) => {
    const month = format(new Date(c.created_at), 'MMM yyyy', { locale: ar });
    byMonth[month] = (byMonth[month] || 0) + 1;
  });

  const chart = Object.entries(byMonth).map(([month, count]) => ({
    name: month,
    value: count
  }));

  const details = customers.map((c: any) => ({
    'اسم العميل': c.name,
    'تاريخ التسجيل': format(new Date(c.created_at), 'd MMMM yyyy', { locale: ar })
  }));

  return {
    data: { customers: customers.length, total: customers.length, details },
    chartData: chart,
  };
}

export function computePoliciesReport(policies: any[]) {
  const byStatus = {
    active: policies.filter((p) => p.status === 'active').length,
    cancelled: policies.filter((p) => p.status === 'cancelled').length
  };

  const byType: Record<string, number> = {};
  policies.forEach((p: any) => {
    const type = p.policy_type;
    byType[type] = (byType[type] || 0) + 1;
  });

  const chart = [
    { name: 'نشط', value: byStatus.active, color: '#22c55e' },
    { name: 'ملغى', value: byStatus.cancelled, color: '#ef4444' }
  ];

  const details = policies.map((p: any) => ({
    'رقم الوثيقة': p.policy_number,
    'العميل': p.customer?.name || '-',
    'الوكيل': p.owner?.name || '-',
    'النوع': POLICY_TYPE_LABELS[p.policy_type as keyof typeof POLICY_TYPE_LABELS] || p.policy_type,
    'الحالة': POLICY_STATUS_LABELS[p.status as keyof typeof POLICY_STATUS_LABELS] || p.status,
    'تاريخ البداية': p.start_date ? format(new Date(p.start_date), 'd MMMM yyyy', { locale: ar }) : '-'
  }));

  return {
    data: { total: policies.length, byStatus, byType, details },
    chartData: chart,
  };
}

export function computeProductionReport(payments: any[], userIds: string[]) {
  const filtered = payments.filter(
    (p: any) => userIds.includes(p.installment?.policy?.owner_id) && p.installment?.is_first
  );
  return computeProductionOrCollection(filtered);
}

// تقرير "التحصيل الدوري" (وأيضاً "إجمالي الإنتاج والتحصيل" غير المتفصل):
// المستحق (كل الأقساط بتاريخ استحقاق داخل الفترة المختارة، بغض النظر عن
// حالة سدادها) مقابل المسدد فعلياً (من جدول المدفوعات لنفس الفترة). لو
// الفترة المختارة فى المستقبل: المستحق يظهر طبيعياً، والمسدد صفر تلقائياً
// لأنه لسه معندهوش مدفوعات مسجّلة.
// includeFirstInstallments=false (افتراضي): التحصيل الدوري فقط (يستبعد أول
// قسط/الإنتاج الجديد). includeFirstInstallments=true: إجمالي غير متفصل —
// يجمع الإنتاج الجديد والتحصيل الدوري فى رقمين فقط (مستحق واحد، مسدد واحد)
// بدل تقسيمهما، لأن installmentsDue وpayments الممرَّرين هنا (من
// fetchInstallmentsDueInRange/fetchPaymentsInRange) يشملوا الكل فعلاً
export function computeCollectionReport(
  payments: any[],
  installmentsDue: any[],
  userIds: string[],
  includeFirstInstallments = false,
) {
  const paidFiltered = payments.filter(
    (p: any) => userIds.includes(p.installment?.policy?.owner_id) && (includeFirstInstallments || !p.installment?.is_first)
  );

  type MonthBucket = { key: string; label: string; due: number; paid: number };
  const buckets = new Map<string, MonthBucket>();
  const getBucket = (dateStr: string) => {
    const d = new Date(dateStr);
    const key = format(d, 'yyyy-MM');
    if (!buckets.has(key)) {
      buckets.set(key, { key, label: format(d, 'MMM yyyy', { locale: ar }), due: 0, paid: 0 });
    }
    return buckets.get(key)!;
  };

  installmentsDue.forEach((i: any) => { getBucket(i.due_date).due += Number(i.amount); });
  paidFiltered.forEach((p: any) => { getBucket(p.payment_month).paid += Number(p.amount); });

  const sortedBuckets = Array.from(buckets.values()).sort((a, b) => a.key.localeCompare(b.key));

  const dueTotal = installmentsDue.reduce((sum: number, i: any) => sum + Number(i.amount), 0);
  const paidTotal = paidFiltered.reduce((sum: number, p: any) => sum + Number(p.amount), 0);

  const chart = sortedBuckets.map((b) => ({ name: b.label, المستحق: b.due, المسدد: b.paid }));

  // تفاصيل السجلات: كل قسط مستحق على حدة (مش ملخص شهري) — ده اللي بيوضح
  // منين جه رقم "المستحق" الإجمالي بالظبط، مع حالة سداده الفعلية من نفس
  // حقل status فى جدول الأقساط (بيتحدّث لـ paid وقت السداد)
  const sortedInstallments = installmentsDue
    .slice()
    .sort((a: any, b: any) => new Date(a.due_date).getTime() - new Date(b.due_date).getTime());

  const details = sortedInstallments.map((i: any) => ({
    'العميل': i.policy?.customer?.name || '-',
    'الوكيل': i.policy?.owner?.name || '-',
    'رقم الوثيقة': i.policy?.policy_number || '-',
    'تاريخ الاستحقاق': format(new Date(i.due_date), 'd MMMM yyyy', { locale: ar }),
    'المبلغ المستحق': formatCurrency(Number(i.amount)),
    'الحالة': i.status === 'paid' ? 'مسدد' : 'غير مسدد',
  }));

  // نسخة "خام" (أرقام وقيم غير منسّقة) تُستخدم فى صفحة التقارير لعرض
  // التفاصيل مُجمّعة حسب الوكيل مع فلترة مسدد/غير مسدد. لازم مصدرين
  // مختلفين مش مصدر واحد، لنفس السبب اللي بيفرّق dueTotal عن paidTotal:
  // - صفوف "مسدد": من paidFiltered (المدفوعات الفعلية اللي payment_month
  //   بتاعها داخل الفترة) — ده بيلقط أي دفعة اتسددت فعلاً خلال الفترة حتى
  //   لو قسطها كان مستحق أصلاً فى شهر سابق ودُفع متأخر (أو العكس)
  // - صفوف "غير مسدد": من installmentsDue اللي لسه مالهاش دفعة (status
  //   != paid) وتاريخ استحقاقها داخل الفترة — دي اللي لسه متبقية فعلاً
  // كده مفيش تكرار: أي قسط مستحق فى الفترة ومسدد فعلاً بيظهر مرة واحدة بس
  // (من مصدر المدفوعات)، وأي قسط مستحق ولسه مسدداش بيظهر مرة واحدة بس
  // (من مصدر الأقساط المستحقة)
  const paidRows = paidFiltered.map((p: any) => ({
    agentId: p.installment?.policy?.owner_id || null,
    agentName: p.installment?.policy?.owner?.name || 'غير محدد',
    customerName: p.installment?.policy?.customer?.name || '-',
    policyNumber: p.installment?.policy?.policy_number || '-',
    dueDate: p.payment_month,
    amount: Number(p.amount),
    status: 'paid' as const,
  }));

  const unpaidRows = installmentsDue
    .filter((i: any) => i.status !== 'paid')
    .map((i: any) => ({
      agentId: i.policy?.owner_id || null,
      agentName: i.policy?.owner?.name || 'غير محدد',
      customerName: i.policy?.customer?.name || '-',
      policyNumber: i.policy?.policy_number || '-',
      dueDate: i.due_date,
      amount: Number(i.amount),
      status: 'unpaid' as const,
    }));

  const installmentsRaw = [...paidRows, ...unpaidRows].sort(
    (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime()
  );

  return {
    data: {
      dueTotal,
      paidTotal,
      collectionRatePeriod: dueTotal > 0 ? Math.round((paidTotal / dueTotal) * 100) : null,
      count: paidFiltered.length,
      details,
      installmentsRaw,
    },
    chartData: chart,
  };
}

function computeProductionOrCollection(filtered: any[]) {
  const byMonth: Record<string, number> = {};
  filtered.forEach((p: any) => {
    const month = format(new Date(p.payment_month), 'MMM yyyy', { locale: ar });
    byMonth[month] = (byMonth[month] || 0) + Number(p.amount);
  });

  const total = filtered.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
  const chart = Object.entries(byMonth).map(([month, value]) => ({ name: month, value }));

  const details = filtered.map((p: any) => ({
    'العميل': p.installment?.policy?.customer?.name || '-',
    'الوكيل': p.installment?.policy?.owner?.name || '-',
    'رقم الوثيقة': p.installment?.policy?.policy_number || '-',
    'الشهر': format(new Date(p.payment_month), 'MMM yyyy', { locale: ar }),
    'المبلغ': formatCurrency(Number(p.amount))
  }));

  return {
    data: { total, count: filtered.length, details },
    chartData: chart,
  };
}

export function computeOverdueReport(installments: any[], userIds: string[]) {
  const overdue = installments.filter(
    (i: any) => userIds.includes(i.policy?.owner_id) && new Date(i.due_date) < new Date() && i.status !== 'paid'
  );

  const total = overdue.reduce((sum: number, i: any) => sum + Number(i.amount), 0);
  const chart = [{ name: 'متأخر', value: total }];

  const details = overdue.map((i: any) => ({
    'العميل': i.policy?.customer?.name || '-',
    'رقم الوثيقة': i.policy?.policy_number || '-',
    'تاريخ الاستحقاق': format(new Date(i.due_date), 'd MMMM yyyy', { locale: ar }),
    'المبلغ': formatCurrency(Number(i.amount))
  }));

  return {
    data: { total, count: overdue.length, details },
    chartData: chart,
  };
}

// "التقييم الشامل" لكل وكيل: يدمج نسبة تحقيق الهدف المالي (70%) مع درجة
// مؤشرات النشاط اليومي المسجَّلة له فى نفس الفترة (30%) — راجع
// performanceScoreCalculator لتفاصيل المعادلة. dailyStatsByAgent: كل صفوف
// daily_agent_stats للفترة المختارة، مجمّعة حسب agent_id.
export function computeAgentsReport(
  agents: any[],
  payments: any[],
  dailyStatsByAgent: Map<string, DailyAgentStatRow[]> = new Map(),
  activityTargets?: ActivityTargets,
) {
  const agentPerformance: any[] = [];

  for (const agent of agents) {
    const achieved = payments
      .filter((p: any) => p.installment?.policy?.owner_id === agent.id)
      .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

    const target = agent.target || 0;
    const financialRate = target > 0 ? Math.round((achieved / target) * 100) : 0;

    const activity = computeActivityScore(
      aggregateEntries(dailyStatsByAgent.get(agent.id) || []),
      activityTargets,
    );
    const scoreResult = computeFinalScore(financialRate, activity);

    agentPerformance.push({
      id: agent.id,
      name: agent.name,
      achieved,
      target,
      rate: financialRate,
      finalScore: scoreResult.finalScore,
      activityScore: scoreResult.activityScore,
      financialOnly: scoreResult.financialOnly,
      ratingLabel: scoreResult.ratingLabel,
      ratingColorClass: scoreResult.ratingColorClass,
      activity,
    });
  }

  const sorted = agentPerformance.sort((a, b) => b.finalScore - a.finalScore);

  const details = sorted.map((a: any) => ({
    'اسم الوكيل': a.name,
    'المحقق': formatCurrency(a.achieved),
    'الهدف': formatCurrency(a.target),
    'نسبة التحقيق المالي': `${a.rate}%`,
    'درجة النشاط': a.activityScore !== null ? `${a.activityScore}%` : 'لا توجد بيانات',
    'التقييم النهائي': `${a.finalScore}%`,
    'التصنيف': a.ratingLabel,
    'الالتزام': a.activity.hasData ? `${a.activity.punctualityPct}%` : '-',
    'مؤشر جودة المواعيد': formatQualityIndicator(a.activity),
    'تفصيل تقييم المواعيد': a.activity.hasData
      ? `ممتاز ${a.activity.appointmentsQualityCounts.excellent} - متوسط ${a.activity.appointmentsQualityCounts.average} - ضعيف ${a.activity.appointmentsQualityCounts.weak}`
      : '-',
    'متوسط المكالمات اليومي': a.activity.hasData ? a.activity.avgCallsPerDay.toFixed(1) : '-',
    'متوسط الزيارات اليومي': a.activity.hasData ? a.activity.avgAppointmentsPerDay.toFixed(1) : '-',
    'متوسط العملاء الجدد يومياً': a.activity.hasData ? a.activity.avgNewClientsPerDay.toFixed(1) : '-',
    'أيام العمل الميداني': a.activity.hasData ? a.activity.outdoorDaysCount : '-',
    'عدد أيام التسجيل': a.activity.hasData ? a.activity.entriesCount : '-',
  }));

  return {
    data: { agents: sorted, details },
    chartData: sorted.slice(0, 10).map((a) => ({ name: a.name, value: a.finalScore })),
  };
}

// تقرير "نسبة الإلغاءات" — يُبنى من ملخص جاهز (CancellationSummary) تم حسابه
// مسبقاً في src/pages/Cancellations، فقط نعيد تنسيقه هنا بنفس شكل باقي
// التقارير (details بمفاتيح عربية + بيانات رسم بياني) دون أي حساب إضافي.
export function computeCancellationsReport(summary: CancellationSummary) {
  const byType: Record<string, number> = {};
  summary.rows.forEach((r) => {
    const label = POLICY_TYPE_LABELS[r.policyType as keyof typeof POLICY_TYPE_LABELS] || r.policyType;
    byType[label] = (byType[label] || 0) + r.totalPaidBeforeCancellation;
  });

  const chart = Object.entries(byType).map(([name, value]) => ({ name, value }));

  const details = summary.rows.map((r) => ({
    'اسم العميل': r.customerName,
    'رقم الوثيقة': r.policyNumberLast6,
    'الوكيل': r.agentName || '-',
    'رئيس المجموعة': r.groupLeaderName || '-',
    'المراقب': r.supervisorName || '-',
    'المراقب العام': r.generalSupervisorName || '-',
    'تاريخ البداية': format(new Date(r.startDate), 'd MMMM yyyy', { locale: ar }),
    'تاريخ الإلغاء': format(new Date(r.cancelledDate), 'd MMMM yyyy', { locale: ar }),
    'عدد الأشهر': r.monthsElapsed,
    'الأقساط المسددة قبل الإلغاء': formatCurrency(r.totalPaidBeforeCancellation),
    'قيمة القسط الصافي': formatCurrency(r.premiumAmount),
    'نوع الوثيقة': POLICY_TYPE_LABELS[r.policyType as keyof typeof POLICY_TYPE_LABELS] || r.policyType,
  }));

  return {
    data: {
      cancellationRate: summary.cancellationRate,
      cancelledValue: summary.cancelledValue,
      totalCollected: summary.totalCollected,
      count: summary.rows.length,
      details,
    },
    chartData: chart,
  };
}

export function computeTeamPerformanceReport(
  performance: {
    id: string; name: string; count: number; achieved: number; target: number;
    finalScore: number; financialRate: number; activityScore: number | null;
    financialOnly: boolean; ratingLabel: string; activity: ActivityScoreResult;
  }[],
  labelKey: 'رئيس المجموعة' | 'المراقب',
) {
  const details = performance.map((p) => ({
    [labelKey]: p.name,
    'عدد الأعضاء': p.count,
    'المحقق': formatCurrency(p.achieved),
    'الهدف': formatCurrency(p.target),
    'نسبة التحقيق المالي': `${p.financialRate}%`,
    'درجة نشاط الفريق': p.activityScore !== null ? `${p.activityScore}%` : 'لا توجد بيانات',
    'التقييم النهائي': `${p.finalScore}%`,
    'التصنيف': p.ratingLabel,
    'الالتزام': p.activity.hasData ? `${p.activity.punctualityPct}%` : '-',
    'مؤشر جودة المواعيد': formatQualityIndicator(p.activity),
    'تفصيل تقييم المواعيد': p.activity.hasData
      ? `ممتاز ${p.activity.appointmentsQualityCounts.excellent} - متوسط ${p.activity.appointmentsQualityCounts.average} - ضعيف ${p.activity.appointmentsQualityCounts.weak}`
      : '-',
    'متوسط المكالمات اليومي (الفريق)': p.activity.hasData ? p.activity.avgCallsPerDay.toFixed(1) : '-',
    'متوسط الزيارات اليومي (الفريق)': p.activity.hasData ? p.activity.avgAppointmentsPerDay.toFixed(1) : '-',
    'متوسط العملاء الجدد يومياً (الفريق)': p.activity.hasData ? p.activity.avgNewClientsPerDay.toFixed(1) : '-',
    'أيام العمل الميداني (الفريق)': p.activity.hasData ? p.activity.outdoorDaysCount : '-',
  }));

  return { details };
}

