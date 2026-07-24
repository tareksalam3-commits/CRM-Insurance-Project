// ============================================================================
// assistantData.ts
// ----------------------------------------------------------------------------
// هذا الملف كان يحتوي على كل دوال قراءة/تحليل بيانات المساعد فى ملف واحد.
// تم تقسيمه إلى modules أصغر تحت analyzers/ و helpers/ لسهولة الصيانة، مع
// الحفاظ الكامل على نفس المنطق والنتائج ونفس الأسماء المُصدَّرة (Exports)
// حتى لا ينكسر أي كود خارجي يعتمد عليها (aiContextService.ts، AssistantWidget.tsx).
// ============================================================================

export type { AssistantAnswer, AgentRow } from './types';

// ── لوحة التحكم (ملخص اليوم / الفرع / نصيحة اليوم) ──
export { getTodaySummary, getBranchSummary, getDailyTip } from './analyzers/dashboardAnalyzer';

// ── المبيعات والإنتاج ──
export { getTodayNewPolicies, getMonthlyProduction, getMonthlyTrend, getYearlyProduction } from './analyzers/salesAnalyzer';

// ── التحصيل ──
export { getTodayCollection, getOverdueCustomers, getTodayTasks } from './analyzers/collectionsAnalyzer';

// ── الإلغاءات ──
export { getCancellationRate } from './analyzers/cancellationsAnalyzer';

// ── أداء المستخدمين والفريق ──
export {
  getAgentsRanking,
  getAgentsCount,
  getGroupLeadersPerformance,
  getSupervisorsPerformance,
  getGeneralSupervisorsPerformance,
  getUnderperformingTeam,
  getOrgStructureSnapshot,
} from './analyzers/usersAnalyzer';

// ── العملاء ──
export {
  getTodayNewCustomers,
  getCustomersCount,
  getDataQualityReview,
  getCustomerDistribution,
} from './analyzers/customersAnalyzer';

// ── الوثائق ──
export { getDocumentsCount } from './analyzers/policiesAnalyzer';

// ── نظرة شاملة (كل المؤشرات: وثائق، مسدد/غير مسدد، تحصيل، إنتاج جديد، إلغاءات) ──
export { getFullSystemOverview } from './analyzers/overviewAnalyzer';

// ── الأهداف ──
export { getRemainingTarget, getGoalsAchievementOverview } from './analyzers/targetsAnalyzer';
