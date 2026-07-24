import { User } from '../../lib/supabase';
import { askAI, AIServiceError, AIChatMessage } from '../../lib/aiService';
import { getAIContext, resolveIntent } from '../../services/aiContextService';
import {
  AssistantAnswer,
  getTodaySummary,
  getRemainingTarget,
  getTodayCollection,
  getOverdueCustomers,
  getTodayTasks,
  getAgentsRanking,
  getMonthlyProduction,
  getGoalsAchievementOverview
} from './assistantData';

import type { QuickCommand } from './types';
import { scoreAllPatterns } from './services/intentMatchingService';
import { ASSISTANT_THINKING_SYSTEM_PROMPT } from './prompts/systemPrompt';

export type { QuickCommand } from './types';

// --------------------------------------------------------------------------
// واجهة عرض الرد (MessageBubble) بتعرض كل سطر كنص عادي (بدون أي Markdown
// renderer) - فلو رجع الذكاء الاصطناعي رموز Markdown خام (**عريض**،
// ### عناوين، --- فواصل) هتتعرض للمستخدم زي ما هي (نجوم وشباك) بدل ما
// تتنسّق. الدالة دي بتشيل رموز الـ Markdown الشائعة دي من كل سطر قبل
// العرض، وبتشيل أي سطر بقى فاضي أو مجرد فاصل (---) بعد التنظيف.
// --------------------------------------------------------------------------
function stripMarkdown(line: string): string {
  return line
    .replace(/^#{1,6}\s*/, '') // ### عناوين
    .replace(/\*\*(.*?)\*\*/g, '$1') // **عريض**
    .replace(/\*(.*?)\*/g, '$1') // *مائل*
    .replace(/^[-*]\s+/, '') // - نقطة قائمة (البابل أصلاً بيضيف نقطة بتاعته)
    .trim();
}

function sanitizeAIReplyLines(reply: string): string[] {
  return reply
    .split('\n')
    .map(stripMarkdown)
    .filter((line) => line.length > 0 && !/^-{3,}$/.test(line));
}

// قائمة الأزرار المعروضة تم تقليصها للأهم فقط (8 بدل 19) تجنبًا لازدحام الشاشة.
// باقي الأوامر لسه شغالة تمامًا عن طريق الكتابة الحرة (QUERY_PATTERNS تحت منفصلة
// عن القائمة دي) - محدش اتحذفت وظيفته، بس اختفى الزر بس.
export const QUICK_COMMANDS: QuickCommand[] = [
  { id: 'today_summary', label: '📊 ملخص أداء اليوم', run: getTodaySummary },
  { id: 'remaining_target', label: '🎯 كم المتبقي لتحقيق الهدف؟', run: getRemainingTarget },
  { id: 'today_collection', label: '💰 التحصيل اليوم', run: getTodayCollection },
  { id: 'overdue_customers', label: '⚠️ العملاء المتأخرون', run: getOverdueCustomers },
  { id: 'today_tasks', label: '📅 مهام اليوم', run: getTodayTasks },
  { id: 'top_agents', label: '👑 أفضل 5 وكلاء', run: (u) => getAgentsRanking(u, 'top', 5) },
  { id: 'monthly_production', label: '🏗️ الإنتاج الشهري', run: getMonthlyProduction },
  { id: 'goals_overview', label: '🎯 نسبة تحقيق الأهداف', run: getGoalsAchievementOverview }
];

export async function runQuickCommand(id: string, user: User): Promise<AssistantAnswer> {
  const command = QUICK_COMMANDS.find((c) => c.id === id);
  if (!command) {
    return { title: 'خطأ', lines: ['الأمر غير معروف'] };
  }
  return command.run(user);
}

// ==========================================================================
// أي سؤال حر (غير أزرار الأوامر السريعة) بيروح مباشرة لخدمة الذكاء الاصطناعي
// الحقيقية (ai-assistant) - مفيش أي رد جاهز/محفوظ محليًا ومفيش اقتراحات
// مكتوبة مسبقًا. الحاجة الوحيدة المحلية اللي بتشتغل هي تخمين "نية" السؤال
// (Intent) عشان نجيب معاه أقرب بيانات حقيقية من قاعدة البيانات كسياق
// للذكاء الاصطناعي (aiContextService) - مش عشان نجاوب بيها إحنا.
// ==========================================================================
export async function parseAndAnswer(query: string, user: User, history: AIChatMessage[] = []): Promise<AssistantAnswer> {
  const raw = query.trim();

  if (!raw) {
    return { title: '🤔', lines: ['اكتب سؤالك أو اختَر أحد الأوامر السريعة'] };
  }

  const scored = scoreAllPatterns(raw);

  try {
    const intent = resolveIntent(scored[0]?.pattern.id);
    const context = await getAIContext(intent, user);

    const hasData = context.data.length > 0;

    const { reply } = await askAI({
      message: raw,
      history,
      systemContext:
        ASSISTANT_THINKING_SYSTEM_PROMPT +
        '\n\n' +
        (hasData
          ? `تم إرفاق بيانات حقيقية من النظام (Intent: ${intent}) ضمن dataContext.data - ` +
            'راجعها بالكامل حسب طريقة التفكير أعلاه، وابنِ ملاحظاتك وأولوياتك وتوصياتك ' +
            'عليها مباشرة فقط، بدون أي رقم أو سبب من عندك.'
          : 'مفيش بيانات نظام مرفقة مع هذا السؤال بالذات (لا يوجد مصدر بيانات مغطّى ' +
            'لهذا النوع من الأسئلة حاليًا). لو السؤال يحتاج أرقام محددة (إنتاج، تحصيل، ' +
            'عملاء...) وضّح صراحة إنك مش شايف البيانات دي مباشرة هنا، أو جاوبه بشكل عام ' +
            'مفيد لو السؤال مش محتاج بيانات (نصيحة، صياغة رسالة، شرح مفهوم...).'),
      dataContext: { role: user.role, name: user.name, ...context }
    });
    return { title: '✨', lines: sanitizeAIReplyLines(reply) };
  } catch (err) {
    return {
      title: '⚠️',
      lines: [
        err instanceof AIServiceError
          ? 'خدمة الذكاء الاصطناعي مش متاحة حاليًا. تأكد إن فيه مزود مفعّل ومظبوط في صفحة AI Settings وحاول تاني.'
          : 'حصل خطأ غير متوقع، جرّب تاني.'
      ]
    };
  }
}
