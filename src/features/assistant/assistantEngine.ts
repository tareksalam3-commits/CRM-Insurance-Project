import { User } from '../../lib/supabase';
import { askAI, AIServiceError } from '../../lib/aiService';
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
import { normalizeArabic } from './helpers/textNormalization';
import { correctText, tokenize } from './helpers/typoCorrection';
import { findDirectMatch, scoreAllPatterns, buildSuggestions } from './services/intentMatchingService';
import { ASSISTANT_THINKING_SYSTEM_PROMPT } from './prompts/systemPrompt';

export type { QuickCommand } from './types';

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
// محرك فهم النية (Smart Intent Engine)
// --------------------------------------------------------------------------
// يعمل بالكامل محليًا داخل التطبيق، بدون أي اتصال بالإنترنت أو أي خدمة ذكاء
// اصطناعي خارجية. يعتمد على: تطبيع النص، قاموس كلمات مفتاحية قابل للتوسيع،
// تجاهل الكلمات غير المهمة، تصحيح تلقائي بسيط للأخطاء الإملائية الشائعة،
// ثم ترتيب النتائج المحتملة واقتراح أقربها عند عدم التأكد.
//
// تفاصيل كل مرحلة (تطبيع النص، قاموس الكلمات المفتاحية، التصحيح التلقائي،
// المطابقة والترتيب، الاقتراحات الذكية) موزّعة على: helpers/textNormalization،
// constants (قاموس الأنماط)، helpers/typoCorrection، و services/intentMatchingService.
// ==========================================================================

// --------------------------------------------------------------------------
// نقطة الدخول الرئيسية
// --------------------------------------------------------------------------
export async function parseAndAnswer(query: string, user: User): Promise<AssistantAnswer> {
  const raw = query.trim();

  if (!raw) {
    return { title: '🤔', lines: ['اكتب سؤالك أو اختَر أحد الأوامر السريعة'] };
  }

  const normalized = normalizeArabic(raw);

  // المرحلة 1: مطابقة مباشرة على النص كما هو
  let match = findDirectMatch(normalized);

  // المرحلة 2: لو مفيش تطابق، نصحح الأخطاء الإملائية البسيطة ونجرب تاني
  if (!match) {
    const corrected = correctText(normalized);
    if (corrected !== normalized) {
      match = findDirectMatch(corrected);
    }
  }

  if (match) {
    return match.run(user);
  }

  // المرحلة 3: مطابقة احتياطية بالتشابه بين الكلمات (مع التصحيح التلقائي)
  // بتتفعّل فقط لو السؤال قصير (٣ كلمات مميزة كحد أقصى بعد استبعاد كلمات
  // الوصل) - زي "الهدف؟" أو "المتأخرين" لوحدها. سبب التقييد: خوارزمية
  // التسجيل بتدّي score=1.0 (تطابق كامل) لمجرد وجود كلمة مفتاحية واحدة أو
  // اتنين مشتركة، وده كان بيخطف أي جملة حرة فيها كلمة زي "الهدف" أو "الفريق"
  // ويمنعها توصل لخدمة الذكاء الاصطناعي الحقيقية (المرحلة ٤) حتى لو كانت
  // سؤال مركّب مش من الأوامر الجاهزة. الجمل الطويلة/المركبة بتتحوّل مباشرة
  // للمرحلة ٤ عشان الذكاء الاصطناعي هو الأقدر يفهم سياقها الكامل.
  const scored = scoreAllPatterns(raw);
  const meaningfulTokenCount = tokenize(raw).length;
  const isShortQuery = meaningfulTokenCount > 0 && meaningfulTokenCount <= 3;

  if (isShortQuery) {
    const best = scored[0];
    if (best && best.score >= 0.6) {
      return best.pattern.run(user);
    }
  }

  // المرحلة 4: لا يوجد أمر محلي مطابق بثقة كافية للتنفيذ المباشر - لكن أقرب
  // نمط (لو موجود) بيدّينا فكرة عن "نية" السؤال (Intent). نستخدمها لجلب أقل
  // بيانات كافية عبر aiContextService (الوسيط الوحيد بين النظام والذكاء
  // الاصطناعي) ثم نبعتها مع السؤال لخدمة الذكاء الاصطناعي الحقيقية
  // (ai-assistant) عشان يحلل بيانات حقيقية بدل ما يرد بشكل عام فاضي.
  try {
    const intent = resolveIntent(scored[0]?.pattern.id);
    const context = await getAIContext(intent, user);

    const hasData = context.data.length > 0;

    const { reply } = await askAI({
      message: raw,
      systemContext:
        ASSISTANT_THINKING_SYSTEM_PROMPT +
        '\n\n' +
        (hasData
          ? `تم إرفاق بيانات حقيقية من النظام (Intent: ${intent}) ضمن dataContext.data - ` +
            'راجعها بالكامل حسب طريقة التفكير أعلاه، وابنِ ملاحظاتك وأولوياتك وتوصياتك ' +
            'عليها مباشرة فقط، بدون أي رقم أو سبب من عندك.'
          : 'مفيش بيانات نظام مرفقة مع هذا السؤال بالذات (لا يوجد مصدر بيانات مغطّى ' +
            'لهذا النوع من الأسئلة حاليًا). لو السؤال يحتاج أرقام محددة (إنتاج، تحصيل، ' +
            'عملاء...) وضّح صراحة إنك مش شايف البيانات دي مباشرة هنا واقترح عليه يستخدم ' +
            'أحد الأوامر السريعة في الأسفل، أو جاوبه بشكل عام مفيد لو السؤال مش محتاج ' +
            'بيانات (نصيحة، صياغة رسالة، شرح مفهوم...).'),
      dataContext: { role: user.role, name: user.name, ...context }
    });
    return { title: '✨', lines: reply.split('\n').filter(Boolean) };
  } catch (err) {
    // خدمة الذكاء الاصطناعي مش متاحة حالياً (مفيش مزود مفعّل / خطأ اتصال) -
    // نرجع لنفس سلوك الاقتراحات المحلية القديم بدل ما نكسر تجربة المستخدم
    const suggestions = buildSuggestions(scored);
    if (err instanceof AIServiceError) {
      return {
        title: '🤔 هل تقصد أحد هذه الأوامر؟',
        lines: suggestions,
        suggestions
      };
    }
    return { title: '⚠️', lines: ['حصل خطأ غير متوقع، جرّب تاني.'] };
  }
}
