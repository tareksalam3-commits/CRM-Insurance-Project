import { User } from '../../lib/supabase';
import {
  AssistantAnswer,
  getTodaySummary,
  getRemainingTarget,
  getAgentsRanking,
  getTodayCollection,
  getTodayNewPolicies,
  getTodayNewCustomers,
  getOverdueCustomers,
  getTodayTasks,
  getGroupLeadersPerformance,
  getBranchSummary
} from './assistantData';

export interface QuickCommand {
  id: string;
  label: string;
  run: (user: User) => Promise<AssistantAnswer>;
}

export const QUICK_COMMANDS: QuickCommand[] = [
  { id: 'today_summary', label: '📊 ملخص أداء اليوم', run: getTodaySummary },
  { id: 'remaining_target', label: '🎯 كم المتبقي لتحقيق الهدف؟', run: getRemainingTarget },
  { id: 'top_agents', label: '👑 أفضل 5 وكلاء', run: (u) => getAgentsRanking(u, 'top', 5) },
  { id: 'bottom_agents', label: '📉 أقل 5 وكلاء', run: (u) => getAgentsRanking(u, 'bottom', 5) },
  { id: 'today_collection', label: '💰 التحصيل اليوم', run: getTodayCollection },
  { id: 'today_policies', label: '📄 الوثائق المضافة اليوم', run: getTodayNewPolicies },
  { id: 'today_customers', label: '👥 العملاء الجدد', run: getTodayNewCustomers },
  { id: 'overdue_customers', label: '⚠️ العملاء المتأخرون', run: getOverdueCustomers },
  { id: 'today_tasks', label: '📅 مهام اليوم', run: getTodayTasks },
  { id: 'group_leaders', label: '📈 أداء رؤساء المجموعات', run: getGroupLeadersPerformance },
  { id: 'branch_summary', label: '📋 ملخص الفرع', run: getBranchSummary }
];

interface QueryPattern {
  keywords: string[];
  run: (user: User) => Promise<AssistantAnswer>;
}

// أنماط بسيطة قائمة على الكلمات المفتاحية - بدون أي ذكاء اصطناعي خارجي.
// الترتيب مهم: الأنماط الأكثر تحديدًا توضع أولًا لتفادي التصادم مع أنماط أعم.
const PATTERNS: QueryPattern[] = [
  { keywords: ['متبقي', 'باقي على الهدف', 'باقي للهدف'], run: getRemainingTarget },
  { keywords: ['أفضل وكيل', 'افضل وكيل', 'أفضل وكلاء', 'افضل وكلاء', 'أفضل 5', 'ترتيب الوكلاء'], run: (u) => getAgentsRanking(u, 'top', 5) },
  { keywords: ['أقل وكيل', 'اقل وكيل', 'أقل وكلاء', 'اقل وكلاء', 'أضعف وكيل', 'اضعف وكيل'], run: (u) => getAgentsRanking(u, 'bottom', 5) },
  { keywords: ['رؤساء المجموعات', 'رئيس مجموعة', 'روساء المجموعات'], run: getGroupLeadersPerformance },
  { keywords: ['متأخر', 'متأخرين', 'متأخرون'], run: getOverdueCustomers },
  { keywords: ['وثائق', 'وثيقة', 'بوليصة', 'بوالص'], run: getTodayNewPolicies },
  { keywords: ['عملاء جدد', 'عميل جديد'], run: getTodayNewCustomers },
  { keywords: ['عدد العملاء', 'كام عميل', 'كم عميل'], run: getBranchSummary },
  { keywords: ['تحصيل اليوم', 'كم التحصيل', 'كام التحصيل'], run: getTodayCollection },
  { keywords: ['مهام اليوم', 'مهامي'], run: getTodayTasks },
  { keywords: ['ملخص الفرع', 'اعرض الفرع', 'أداء الفرع', 'اداء الفرع', 'كم حقق الفرع', 'كام حقق الفرع'], run: getBranchSummary },
  { keywords: ['ملخص اليوم', 'أداء اليوم', 'اداء اليوم'], run: getTodaySummary }
];

export async function runQuickCommand(id: string, user: User): Promise<AssistantAnswer> {
  const command = QUICK_COMMANDS.find((c) => c.id === id);
  if (!command) {
    return { title: 'خطأ', lines: ['الأمر غير معروف'] };
  }
  return command.run(user);
}

export async function parseAndAnswer(query: string, user: User): Promise<AssistantAnswer> {
  const normalized = query.trim();

  if (!normalized) {
    return { title: '🤔', lines: ['اكتب سؤالك أو اختَر أحد الأوامر السريعة'] };
  }

  const match = PATTERNS.find((p) => p.keywords.some((k) => normalized.includes(k)));

  if (match) {
    return match.run(user);
  }

  return {
    title: '🤔 لم أفهم السؤال',
    lines: [
      'جرّب صياغة أوضح، أو استخدم أحد الأوامر السريعة بالأسفل.',
      'مثال: "كم المتبقي على الهدف؟" أو "أفضل وكيل"'
    ]
  };
}
