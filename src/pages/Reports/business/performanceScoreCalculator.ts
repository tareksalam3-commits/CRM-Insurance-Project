// ==========================================================================
// "التقييم الشامل": يدمج نسبة تحقيق الهدف المالي (70%) مع درجة مؤشرات
// النشاط اليومي (30%) فى رقم تقييم نهائي واحد من 100.
//
// نفس المعادلة بالضبط تُستخدم لأي نطاق: وكيل واحد (على أرقامه الشخصية)،
// رئيس مجموعة (على هدف مجموعته المالي + إجمالي نشاط أفرادها)، أو مراقب
// (على هدف نطاقه المالي + إجمالي نشاط كل الوكلاء تحته) — الفرق الوحيد هو
// أي StatsAggregate بيتمرر للدالة، مش المعادلة نفسها.
// ==========================================================================

import type { StatsAggregate } from '../../DailyReports/types';

export interface ActivityTargets {
  callsDailyTarget: number;
  appointmentsDailyTarget: number;
  newClientsDailyTarget: number;
}

export const DEFAULT_ACTIVITY_TARGETS: ActivityTargets = {
  callsDailyTarget: 15,
  appointmentsDailyTarget: 3,
  newClientsDailyTarget: 1,
};

export interface ActivityScoreResult {
  /** درجة النشاط من 100 — null لو مفيش أي إحصائيات مسجّلة فى الفترة إطلاقاً
   * (بيفرّق الحالة دي عن "درجة صفر" الحقيقية، عشان معادلة الدرجة النهائية
   * تعتمد على المالي فقط بدل ما تعاقب الشخص على تقصير رئيس مجموعته فى التسجيل) */
  score: number | null;
  hasData: boolean;
  entriesCount: number;
  punctualityPct: number;
  callsScore: number;
  appointmentsScore: number;
  newClientsScore: number;
  avgCallsPerDay: number;
  avgAppointmentsPerDay: number;
  avgNewClientsPerDay: number;
  // جودة المواعيد: للعلم فقط، لا تدخل فى الدرجة الرقمية الإجمالية (score)
  appointmentsQualityCounts: StatsAggregate['appointmentsQualityCounts'];
  /** إجمالي عدد المواعيد اللي اتقيّمت (ممتاز+متوسط+ضعيف) — 0 لو محدش قيّم مواعيده */
  appointmentsQualityTotal: number;
  /** مؤشر جودة المواعيد من 100: ممتاز=100، متوسط=50، ضعيف=صفر، مرجّح بعدد كل تصنيف.
   * null لو مفيش أي مواعيد مقيَّمة إطلاقاً (بيفرّق عن "صفر" الحقيقي) */
  appointmentsQualityScore: number | null;
  /** تصنيف نصي لمؤشر جودة المواعيد، أو 'لا توجد بيانات' لو مفيش مواعيد مقيَّمة */
  appointmentsQualityLabel: string;
  outdoorDaysCount: number;
}

const cap100 = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

/** يحوّل توزيع (ممتاز/متوسط/ضعيف) لمؤشر جودة رقمي من 100 + تصنيف نصي واضح،
 * بدل عرض الأعداد الخام التي لا توضح مستوى الجودة الفعلي بنظرة واحدة. */
function computeAppointmentsQuality(counts: StatsAggregate['appointmentsQualityCounts']): {
  total: number; score: number | null; label: string;
} {
  const total = counts.excellent + counts.average + counts.weak;
  if (total === 0) return { total: 0, score: null, label: 'لا توجد بيانات' };

  const score = cap100(((counts.excellent * 100) + (counts.average * 50)) / total);
  let label: string;
  if (score >= 85) label = 'ممتازة';
  else if (score >= 65) label = 'جيدة';
  else if (score >= 40) label = 'متوسطة';
  else label = 'ضعيفة';

  return { total, score, label };
}

/** درجة النشاط من إجمالي مجمّع (StatsAggregate) — لفرد واحد أو نطاق كامل
 * على حد سواء، بنفس المعادلة بالضبط */
export function computeActivityScore(
  agg: StatsAggregate,
  targets: ActivityTargets = DEFAULT_ACTIVITY_TARGETS,
): ActivityScoreResult {
  if (agg.entriesCount === 0) {
    return {
      score: null,
      hasData: false,
      entriesCount: 0,
      punctualityPct: 0,
      callsScore: 0,
      appointmentsScore: 0,
      newClientsScore: 0,
      avgCallsPerDay: 0,
      avgAppointmentsPerDay: 0,
      avgNewClientsPerDay: 0,
      appointmentsQualityCounts: { excellent: 0, average: 0, weak: 0 },
      appointmentsQualityTotal: 0,
      appointmentsQualityScore: null,
      appointmentsQualityLabel: 'لا توجد بيانات',
      outdoorDaysCount: 0,
    };
  }

  const avgCallsPerDay = agg.callsActual / agg.entriesCount;
  const avgAppointmentsPerDay = agg.appointmentsActual / agg.entriesCount;
  const avgNewClientsPerDay = agg.newClients / agg.entriesCount;

  const punctualityPct = cap100((agg.punctualityOkCount / agg.entriesCount) * 100);
  const callsScore = cap100((avgCallsPerDay / targets.callsDailyTarget) * 100);
  const appointmentsScore = cap100((avgAppointmentsPerDay / targets.appointmentsDailyTarget) * 100);
  const newClientsScore = cap100((avgNewClientsPerDay / targets.newClientsDailyTarget) * 100);

  // أربعة مؤشرات بوزن متساوٍ داخل الـ30% (الالتزام، المكالمات، المواعيد،
  // العملاء الجدد) — جودة المواعيد ونسبة تحويل المكالمات معروضتان للعلم فقط
  const score = Math.round((punctualityPct + callsScore + appointmentsScore + newClientsScore) / 4);
  const quality = computeAppointmentsQuality(agg.appointmentsQualityCounts);

  return {
    score,
    hasData: true,
    entriesCount: agg.entriesCount,
    punctualityPct,
    callsScore,
    appointmentsScore,
    newClientsScore,
    avgCallsPerDay,
    avgAppointmentsPerDay,
    avgNewClientsPerDay,
    appointmentsQualityCounts: agg.appointmentsQualityCounts,
    appointmentsQualityTotal: quality.total,
    appointmentsQualityScore: quality.score,
    appointmentsQualityLabel: quality.label,
    outdoorDaysCount: agg.outdoorDaysCount,
  };
}

export interface FinalScoreResult {
  finalScore: number;
  financialRate: number;
  activityScore: number | null;
  /** true لو الدرجة النهائية اعتمدت على المالي فقط لعدم وجود بيانات نشاط */
  financialOnly: boolean;
  ratingLabel: string;
  ratingColorClass: string;
}

const WEIGHTS = { financial: 0.7, activity: 0.3 };

/** الدرجة النهائية المدمجة: 70% نسبة تحقيق الهدف المالي + 30% درجة النشاط.
 * لو مفيش بيانات نشاط مسجّلة أصلاً فى الفترة، الدرجة النهائية = النسبة
 * المالية فقط (بدل معاقبة الشخص على عدم تسجيل رئيس مجموعته للإحصائيات) */
export function computeFinalScore(financialRate: number, activity: ActivityScoreResult): FinalScoreResult {
  const cappedFinancial = cap100(financialRate);
  const financialOnly = !activity.hasData || activity.score === null;
  const finalScore = financialOnly
    ? cappedFinancial
    : Math.round(cappedFinancial * WEIGHTS.financial + (activity.score as number) * WEIGHTS.activity);

  const { label, colorClass } = ratingLabelFor(finalScore);

  return {
    finalScore,
    financialRate: cappedFinancial,
    activityScore: activity.score,
    financialOnly,
    ratingLabel: label,
    ratingColorClass: colorClass,
  };
}

export function ratingLabelFor(score: number): { label: string; colorClass: string } {
  if (score >= 90) return { label: 'ممتاز', colorClass: 'text-success-700 bg-success-50' };
  if (score >= 75) return { label: 'جيد جداً', colorClass: 'text-primary-700 bg-primary-50' };
  if (score >= 60) return { label: 'جيد', colorClass: 'text-amber-700 bg-amber-50' };
  if (score >= 40) return { label: 'مقبول', colorClass: 'text-amber-800 bg-amber-100' };
  return { label: 'ضعيف', colorClass: 'text-error-700 bg-error-50' };
}
