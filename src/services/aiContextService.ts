import { User } from '../lib/supabase';
import {
  getTodaySummary,
  getBranchSummary,
  getCustomerDistribution,
  getCustomersCount,
  getDataQualityReview,
  getTodayCollection,
  getOverdueCustomers,
  getTodayTasks,
  getAgentsRanking,
  getAgentsCount,
  getUnderperformingTeam,
  getGroupLeadersPerformance,
  getSupervisorsPerformance,
  getGeneralSupervisorsPerformance,
  getRemainingTarget,
  getGoalsAchievementOverview,
  getMonthlyProduction,
  getMonthlyTrend,
  getYearlyProduction,
  getCancellationRate,
  getDocumentsCount,
  getFullSystemOverview,
  getOrgStructureSnapshot,
  AssistantAnswer
} from '../features/assistant/assistantData';

// ============================================================================
// AI Context Service — الوسيط الوحيد بين النظام والذكاء الاصطناعي
// ----------------------------------------------------------------------------
// مسؤوليتها فقط: تحديد البيانات المطلوبة حسب Intent، وجلبها بأقل استهلاك
// ممكن، مع احترام صلاحيات المستخدم (كل الدوال المستخدمة هنا بتفلتر البيانات
// حسب نطاق رؤية المستخدم زي ما هي بالظبط في assistantData.ts - لا تكرار كود).
//
// النظام لا يعرّف "أدوات" منفصلة لكل استعلام. بدل كده، كل الاستعلامات
// بتتجمّع تحت عدد صغير وثابت من الـ Intents. إضافة إمكانية جديدة مستقبلاً
// = إضافة سطر واحد في INTENT_FETCHERS، مش دالة/أداة جديدة بالكامل.
// ============================================================================

export type AIIntent =
  | 'dashboard_analysis'
  | 'client_analysis'
  | 'collections_summary'
  | 'agent_performance'
  | 'group_performance'
  | 'targets'
  | 'reports'
  | 'search'
  | 'general_question';

export const AI_INTENTS: AIIntent[] = [
  'dashboard_analysis',
  'client_analysis',
  'collections_summary',
  'agent_performance',
  'group_performance',
  'targets',
  'reports',
  'search',
  'general_question'
];

// خريطة: كل Intent قديم (id بتاع الأوامر السريعة/الأنماط المحلية الموجودة
// فعليًا في assistantEngine.ts) يتحول لـ Intent عام واحد من القايمة اللي فوق.
// بتُستخدم لتحويل نتيجة محرك فهم النية المحلي (الموجود بالفعل) لـ Intent
// موحّد، من غير ما نعمل استدعاء AI إضافي بس عشان "نصنّف" السؤال (توفير API).
const PATTERN_TO_INTENT: Record<string, AIIntent> = {
  today_summary: 'dashboard_analysis',
  branch_summary: 'dashboard_analysis',
  data_quality: 'client_analysis',
  customers_count: 'client_analysis',
  customer_distribution: 'client_analysis',
  today_collection: 'collections_summary',
  overdue_customers: 'collections_summary',
  today_policies: 'collections_summary',
  today_customers: 'client_analysis',
  top_agents: 'agent_performance',
  bottom_agents: 'agent_performance',
  agents_count: 'agent_performance',
  underperforming_team: 'agent_performance',
  group_leaders: 'group_performance',
  supervisors_performance: 'group_performance',
  general_supervisors_performance: 'group_performance',
  org_structure: 'group_performance',
  remaining_target: 'targets',
  goals_overview: 'targets',
  monthly_production: 'reports',
  monthly_comparison: 'reports',
  yearly_production: 'reports',
  cancellation_rate: 'reports',
  documents_count: 'reports',
  today_tasks: 'general_question'
};

export function resolveIntent(patternId?: string | null): AIIntent {
  if (patternId && PATTERN_TO_INTENT[patternId]) return PATTERN_TO_INTENT[patternId];
  return 'general_question';
}

// كل Intent بيتربط بمجموعة صغيرة من دوال جلب البيانات الموجودة بالفعل
// (مفيش أي استعلام Supabase جديد هنا — فقط إعادة استخدام). النتائج بترجع
// بصيغة موحّدة عشان الذكاء الاصطناعي ياخدها زي ما هي.
type Fetcher = (user: User) => Promise<AssistantAnswer>;

const INTENT_FETCHERS: Record<AIIntent, Fetcher[]> = {
  dashboard_analysis: [getTodaySummary, getBranchSummary],
  client_analysis: [getCustomerDistribution, getCustomersCount, getDataQualityReview],
  collections_summary: [getTodayCollection, getOverdueCustomers],
  agent_performance: [
    (u) => getAgentsRanking(u, 'top', 5),
    (u) => getAgentsRanking(u, 'bottom', 5),
    getAgentsCount,
    getUnderperformingTeam
  ],
  group_performance: [getGroupLeadersPerformance, getSupervisorsPerformance, getGeneralSupervisorsPerformance],
  targets: [getRemainingTarget, getGoalsAchievementOverview],
  reports: [getMonthlyProduction, getMonthlyTrend, getYearlyProduction, getCancellationRate, getDocumentsCount],
  // Intent قابل للتوسع مستقبلاً (مثلاً: بحث باسم عميل/وكيل معيّن) - حاليًا
  // بيرجع بدون بيانات إضافية، الذكاء الاصطناعي بيرد بشكل عام أو بيوجّه
  // المستخدم للصفحة المناسبة.
  search: [],
  // الأسئلة الحرة غير المصنّفة (زي "اقترح أنشطة أحفز بيها الفريق النهارده")
  // هي الأكثر شيوعًا والأصعب. دلوقتي getFullSystemOverview و
  // getOrgStructureSnapshot بيترفقوا مع كل سؤال تلقائيًا (زي ما هو موضّح في
  // getAIContext تحت)، فبيغطوا الأرقام الأساسية والهيكل الوظيفي بالفعل -
  // مفيش داعي نكرر نفس المعنى تاني هنا (زي getBranchSummary أو getTodaySummary
  // اللي بيجيبوا نفس أرقام الوثائق/المدفوعات تقريبًا). اللي متبقي وليه قيمة
  // حقيقية هنا هو التفاصيل "على مستوى الأفراد والمهام" اللي مش موجودة في
  // النظرة الشاملة: مين محتاج متابعة، مين أفضل/أضعف أداء، مين مستحق عليه
  // حاجة النهارده. ده كمان بيقلل عدد الاستعلامات (وبالتالي زمن الاستجابة)
  // بدل ما نجيب 10 مصادر بيانات نص متكرر.
  general_question: [
    getTodayTasks,
    getOverdueCustomers,
    (u) => getAgentsRanking(u, 'top', 5),
    (u) => getAgentsRanking(u, 'bottom', 5),
    getUnderperformingTeam
  ]
};

export interface AIContext {
  intent: AIIntent;
  data: AssistantAnswer[];
}

/**
 * نقطة الدخول الوحيدة: بتاخد Intent (متحدد مسبقًا محليًا أو من الذكاء
 * الاصطناعي) + المستخدم الحالي، وترجع البيانات الكافية للتحليل.
 *
 * ملاحظة مهمة: getFullSystemOverview و getOrgStructureSnapshot بيترجعوا مع
 * كل سؤال (بغض النظر عن الـ Intent)، لأن تصنيف النية محلي (Pattern matching)
 * بيغلط أحيانًا أو مبيلاقيش نمط واضح أصلاً - قبل كده في الحالة دي كان الذكاء
 * الاصطناعي بيرد من غير أي بيانات حقيقية، وكمان مكانش عنده أي فكرة عن الهيكل
 * الوظيفي (مين تحت مين، درجة كل شخص) لأن ده معلومة مطلوبة في شبه كل سؤال
 * إداري/تحليلي مش بس أسئلة الهيكل المباشرة. دلوقتي عنده دايمًا صورة شاملة
 * (وثائق/مسدد/غير مسدد/تحصيل/إنتاج جديد/إلغاءات + الهيكل الوظيفي بأسماء
 * حقيقية) كأرضية ثابتة، وفوقها بيانات الـ Intent المحدد (لو الأنماط عرفت
 * تصنف السؤال صح) بتضيف تفاصيل أدق (ترتيب وكلاء، توزيع عملاء، إلخ). التكلفة
 * بسيطة جدًا لأن الدالتين مبنيين على نفس الـ cache (dalRead) وبيتقروا مرة
 * واحدة فقط.
 */
export async function getAIContext(intent: AIIntent, user: User): Promise<AIContext> {
  const fetchers = INTENT_FETCHERS[intent] || [];
  const [overview, orgStructure, ...intentData] = await Promise.all([
    getFullSystemOverview(user),
    getOrgStructureSnapshot(user),
    ...fetchers.map((fn) => fn(user))
  ]);
  return { intent, data: [overview, orgStructure, ...intentData] };
}
