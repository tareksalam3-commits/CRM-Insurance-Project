import { User } from '../../lib/supabase';
import {
  AssistantAnswer,
  getTodaySummary,
  getRemainingTarget,
  getAgentsRanking,
  getAgentsCount,
  getCustomersCount,
  getDocumentsCount,
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

// لم يتم تعديل أو حذف أي أمر سريع حالي - القائمة كما هي بالظبط
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
// ==========================================================================

// --------------------------------------------------------------------------
// 1) تطبيع النص العربي (Normalization)
// --------------------------------------------------------------------------
// بيوحّد أشكال الحروف المختلفة (أ/إ/آ ← ا، ة ← ه، ى ← ي...) ويشيل التشكيل
// والمسافات الزايدة، عشان "الأهداف" و"الاهداف" و"الاهدآف" تتحسب نفس الكلمة.
function normalizeArabic(text: string): string {
  return text
    .replace(/[\u064B-\u0652]/g, '')       // إزالة التشكيل
    .replace(/[إأآا]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[ؤئ]/g, 'ء')
    .replace(/ـ+/g, '')                     // إزالة التطويل
    .replace(/[؟?!.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// --------------------------------------------------------------------------
// 2) الكلمات غير المهمة (Stop Words / Filler Words)
// --------------------------------------------------------------------------
// كلمات لا تحمل معنى مميز أو أفعال عامة ("قولي"، "اعرض"، "هات"...) بتتكرر في
// صيغ مختلفة من نفس السؤال. بنستبعدها من حساب التشابه، وكمان بتمثل دعم
// اللهجة المصرية (بحيث ميظهرش خطأ لمجرد استخدام كلمة عامية عامة).
const STOP_WORDS = new Set([
  // أدوات ربط وضمائر فصحى
  'في', 'من', 'على', 'الي', 'إلى', 'هو', 'هي', 'ده', 'دي', 'يا', 'و', 'ال',
  'عن', 'مع', 'انا', 'أنا', 'احنا', 'أحنا', 'لو', 'او', 'أو', 'يعني', 'بس',
  'دلوقتي', 'فين', 'ازاي', 'إزاي',
  // كلمات استفهام عامة عن الكمية (بتتكرر في كل الصيغ، مش مميزة لنية بعينها)
  'كم', 'كام', 'ايه', 'إيه', 'عدد',
  // عبارات مجاملة/تهذيب لا تؤثر على المعنى
  'سمحت', 'ممكن', 'بالله', 'عليك', 'فضلك', 'رجاء', 'ياريت',
  // أفعال طلب عامة (اللهجة المصرية) - بتتفهم وتتجاهل لأنها مش مميزة لنية بعينها
  'عايز', 'عاوز', 'اعرف', 'أعرف', 'محتاج', 'قول', 'قولي', 'اعرض', 'هات',
  'طلع', 'طلعلي', 'وريني', 'ورينى', 'احسب', 'اجيب', 'جيب', 'مساعد',
  // ضمير استفهام عن الشخص - مفيد فقط كجزء من عبارة كاملة، مش لوحده
  'مين'
].map(normalizeArabic));

interface QueryPattern {
  id: string;
  // عبارات مفتاحية كاملة (تُستخدم في المطابقة المباشرة عبر substring)
  keywords: string[];
  // أمثلة توضيحية تُعرض للمستخدم عند الاقتراح ("هل تقصد؟")
  examples: string[];
  run: (user: User) => Promise<AssistantAnswer>;
}

// --------------------------------------------------------------------------
// 3) قاموس الكلمات المفتاحية (Keywords Dictionary)
// --------------------------------------------------------------------------
// كل نية (Intent) عبارة عن: مجموعة صيغ مرادفة + دالة تنفيذ. لإضافة نية جديدة
// مستقبلًا، يكفي إضافة عنصر جديد هنا بدون أي تعديل في منطق المطابقة نفسه.
// الترتيب مهم: الأنماط الأكثر تحديدًا توضع أولًا لتفادي التصادم مع أنماط أعم.
const PATTERNS: QueryPattern[] = [
  {
    id: 'remaining_target',
    keywords: [
      'متبقي', 'باقي على الهدف', 'باقي للهدف', 'كام باقي', 'كم باقي',
      'باقي كام', 'فاضل كام', 'فاضل علي الهدف', 'فاضل للهدف',
      'ناقص كام', 'ناقص كم', 'ينقصنا كام', 'كم ينقصنا', 'كام ينقصنا',
      'محتاج كام للهدف', 'نسبة الهدف', 'نسبه الهدف',
      'وصلنا فين من الهدف', 'وصلنا لفين', 'تارجت', 'target', 'الهدف الشهري',
      'الهدف بتاعي', 'حققت كام من الهدف', 'المتبقي لتحقيق الهدف'
    ],
    examples: ['كم المتبقي لتحقيق الهدف؟'],
    run: getRemainingTarget
  },
  {
    id: 'agents_count',
    keywords: [
      'عدد الوكلاء', 'عدد وكلاء', 'كام وكيل', 'كم وكيل', 'عندي كام وكيل',
      'عندنا كام وكيل', 'كام agent', 'عدد الفريق', 'عدد الافراد',
      'الوكلاء كام', 'الوكلاء كم', 'احسب عدد الوكلاء', 'كام موظف',
      'عدد الموظفين', 'اجمالي الوكلاء', 'إجمالي الوكلاء'
    ],
    examples: ['كم عدد الوكلاء؟'],
    run: getAgentsCount
  },
  {
    id: 'customers_count',
    keywords: [
      'عدد العملاء', 'العملاء كام', 'العملاء كم', 'كام عميل', 'كم عميل',
      'اجمالي العملاء', 'إجمالي العملاء', 'عدد الزباين', 'كام زبون'
    ],
    examples: ['كم عدد العملاء؟'],
    run: getCustomersCount
  },
  {
    id: 'documents_count',
    keywords: [
      'عدد الوثائق', 'الوثائق كام', 'الوثائق كم', 'كام وثيقة', 'كم وثيقة',
      'اجمالي الوثائق', 'إجمالي الوثائق', 'عدد البوالص', 'كام بوليصة',
      'عدد الوثيقه'
    ],
    examples: ['كم عدد الوثائق؟'],
    run: getDocumentsCount
  },
  {
    id: 'top_agents',
    keywords: [
      'أفضل وكيل', 'افضل وكيل', 'أفضل وكلاء', 'افضل وكلاء', 'أفضل 5',
      'افضل 5', 'ترتيب الوكلاء', 'توب الوكلاء', 'مين احسن وكيل', 'مين أحسن وكيل',
      'الوكلاء المتفوقين', 'اعلى الوكلاء', 'أعلى الوكلاء', 'مين اكتر واحد حقق',
      'مين أكتر واحد حقق', 'الوكلاء المتميزين', 'اعلي انتاج', 'أعلى إنتاج',
      'اكثر انتاج', 'أكثر إنتاج', 'افضل موظف', 'أفضل موظف', 'افضل اداء',
      'أفضل أداء', 'اعلي مبيعات', 'أعلى مبيعات', 'الاول', 'الأول'
    ],
    examples: ['مين أفضل وكيل؟'],
    run: (u) => getAgentsRanking(u, 'top', 5)
  },
  {
    id: 'bottom_agents',
    keywords: [
      'أقل وكيل', 'اقل وكيل', 'أقل وكلاء', 'اقل وكلاء', 'أضعف وكيل', 'اضعف وكيل',
      'الوكلاء الضعاف', 'مين اقل واحد', 'مين أقل واحد', 'محتاجين متابعة',
      'أضعف 5', 'اضعف 5', 'اقل 5', 'أقل 5', 'الوكلاء المتأخرين في الإنتاج',
      'اقل انتاج', 'أقل إنتاج', 'اخر الترتيب', 'آخر الترتيب', 'اسوا اداء',
      'أسوأ أداء'
    ],
    examples: ['مين أقل وكيل أداءً؟'],
    run: (u) => getAgentsRanking(u, 'bottom', 5)
  },
  {
    id: 'group_leaders',
    keywords: [
      'رؤساء المجموعات', 'رئيس مجموعة', 'روساء المجموعات', 'أداء الفرق',
      'اداء الفرق', 'قادة المجموعات', 'تقييم الفرق', 'أداء الجروبات',
      'اداء الجروبات', 'رؤساء الفرق'
    ],
    examples: ['ما أداء رؤساء المجموعات؟'],
    run: getGroupLeadersPerformance
  },
  {
    id: 'overdue_customers',
    keywords: [
      'متأخر', 'متأخرين', 'متأخرون', 'متعثر', 'متعثرين', 'أقساط متأخرة',
      'اقساط متاخره', 'الديون', 'ديون العملاء', 'عملاء عليهم مبالغ',
      'عملاء لسه ما دفعوش', 'عملاء لسه مادفعوش'
    ],
    examples: ['فيه عملاء متأخرين؟'],
    run: getOverdueCustomers
  },
  {
    id: 'today_policies',
    keywords: [
      'وثائق اليوم', 'وثيقة اليوم', 'بوليصة اليوم', 'بوالص اليوم', 'وثايق النهارده',
      'كام وثيقة النهارده', 'كم وثيقة اليوم', 'بوالص جديدة', 'وثائق مضافة اليوم',
      'وثائق جديدة اليوم'
    ],
    examples: ['كم وثيقة أُضيفت اليوم؟'],
    run: getTodayNewPolicies
  },
  {
    id: 'today_customers',
    keywords: [
      'عملاء جدد', 'عميل جديد', 'عملاء اتضافوا النهارده', 'عملاء انضافوا اليوم',
      'كام عميل جديد', 'كم عميل جديد', 'العملاء اللي اتضافوا اليوم'
    ],
    examples: ['كام عميل جديد النهاردة؟'],
    run: getTodayNewCustomers
  },
  {
    id: 'branch_summary',
    keywords: [
      'ملخص الفرع', 'اعرض الفرع', 'أداء الفرع', 'اداء الفرع', 'كم حقق الفرع',
      'كام حقق الفرع', 'احصائيات الفرع', 'إحصائيات الفرع', 'بيانات الفرع',
      'الفرع عامل ايه', 'الفرع عامل إيه', 'حالة الفرع'
    ],
    examples: ['اعرض لي ملخص الفرع'],
    run: getBranchSummary
  },
  {
    id: 'today_collection',
    keywords: [
      'تحصيل اليوم', 'كم التحصيل', 'كام التحصيل', 'فلوس اليوم', 'تحصيل النهارده',
      'كام اتحصل', 'كم اتحصل', 'المبلغ المحصل', 'المحصل النهارده', 'إجمالي التحصيل اليوم',
      'اجمالي التحصيل اليوم', 'قيمة التحصيل', 'التحصيل كام'
    ],
    examples: ['كم التحصيل اليوم؟'],
    run: getTodayCollection
  },
  {
    id: 'today_tasks',
    keywords: [
      'مهام اليوم', 'مهامي', 'شغل النهارده', 'ايه المطلوب اليوم', 'إيه المطلوب اليوم',
      'التزامات اليوم', 'أجندة اليوم', 'اجندة اليوم', 'إيه شغلي النهارده'
    ],
    examples: ['إيه مهامي النهاردة؟'],
    run: getTodayTasks
  },
  {
    id: 'today_summary',
    keywords: [
      'ملخص اليوم', 'أداء اليوم', 'اداء اليوم', 'عامل ايه النهارده', 'عامل إيه النهارده',
      'ازاي كان اليوم', 'إزاي كان اليوم', 'تقرير اليوم', 'خلاصة اليوم', 'يومي عامل ايه'
    ],
    examples: ['اعمل ملخص لأداء اليوم'],
    run: getTodaySummary
  }
];

// نطبّع كل الكلمات المفتاحية مرة واحدة عند التحميل بدل ما نعيد الحساب مع كل سؤال
const NORMALIZED_PATTERNS = PATTERNS.map((p) => ({
  ...p,
  keywords: p.keywords.map(normalizeArabic)
}));

// اقتراحات افتراضية تُعرض عندما يكون السؤال عامًا جدًا (زي "كام" لوحدها)
// ولا يوجد أي كلمة مميزة تساعد في تحديد النية
const DEFAULT_SUGGESTIONS = [
  'كم عدد الوكلاء؟',
  'كم عدد العملاء؟',
  'كم عدد الوثائق؟',
  'كم المتبقي لتحقيق الهدف؟',
  'كم التحصيل اليوم؟'
];

// --------------------------------------------------------------------------
// 4) التصحيح التلقائي للأخطاء الإملائية البسيطة (Typo Tolerance)
// --------------------------------------------------------------------------
// مسافة ليفنشتاين (Levenshtein Distance) لحساب عدد الحروف المختلفة بين كلمتين
function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;

  const prev = new Array(n + 1);
  const curr = new Array(n + 1);
  for (let j = 0; j <= n; j++) prev[j] = j;

  for (let i = 1; i <= m; i++) {
    curr[0] = i;
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        prev[j] + 1,      // حذف
        curr[j - 1] + 1,  // إضافة
        prev[j - 1] + cost // استبدال
      );
    }
    for (let j = 0; j <= n; j++) prev[j] = curr[j];
  }
  return prev[n];
}

// قاموس كل الكلمات المميزة (بعد استبعاد الكلمات غير المهمة) المستخرجة من كل
// عبارات النظام، وبيُستخدم كمرجع لتصحيح الأخطاء الإملائية البسيطة تلقائيًا
const VOCAB: Set<string> = new Set(
  NORMALIZED_PATTERNS.flatMap((p) =>
    p.keywords.flatMap((k) => k.split(' ').filter((w) => w.length >= 3 && !STOP_WORDS.has(w)))
  )
);

// بيحاول يلاقي أقرب كلمة صحيحة في القاموس لكلمة مكتوبة غلط، بحد أقصى فرق
// حرف أو حرفين حسب طول الكلمة (عشان نتجنب تصحيحات غلط لكلمات قصيرة)
function correctWord(word: string): string {
  if (word.length < 3 || VOCAB.has(word)) return word;

  const threshold = word.length <= 4 ? 1 : 2;
  let bestWord: string | null = null;
  let bestDistance = Infinity;

  for (const candidate of VOCAB) {
    if (Math.abs(candidate.length - word.length) > threshold) continue;
    const distance = levenshtein(word, candidate);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestWord = candidate;
      if (distance === 0) break;
    }
  }

  return bestWord && bestDistance <= threshold ? bestWord : word;
}

// يطبّق التصحيح التلقائي على كل كلمة في النص، مفيد لالتقاط الصيغ اللي فيها
// خطأ إملائي حتى في المطابقة المباشرة (وليس فقط الاحتياطية)
function correctText(text: string): string {
  return text
    .split(' ')
    .map((w) => (STOP_WORDS.has(w) ? w : correctWord(w)))
    .join(' ');
}

function tokenize(text: string): string[] {
  return normalizeArabic(text)
    .split(' ')
    .filter((w) => w && !STOP_WORDS.has(w))
    .map((w) => correctWord(w));
}

// --------------------------------------------------------------------------
// 5) المطابقة والترتيب (Matching & Ranking)
// --------------------------------------------------------------------------
function findDirectMatch(normalizedText: string): QueryPattern | null {
  const found = NORMALIZED_PATTERNS.find((p) => p.keywords.some((k) => normalizedText.includes(k)));
  return found || null;
}

// بيحسب لكل الأنماط درجة تشابه مع سؤال المستخدم (نسبة الكلمات المشتركة)
// ويرجع الكل مرتبين تنازليًا حسب الأقرب، عشان نقدر نبني منهم اقتراحات ذكية
function scoreAllPatterns(query: string): { pattern: QueryPattern; score: number }[] {
  const queryTokens = new Set(tokenize(query));
  if (queryTokens.size === 0) return [];

  const results: { pattern: QueryPattern; score: number }[] = [];

  for (const pattern of NORMALIZED_PATTERNS) {
    let bestScoreForPattern = 0;
    for (const keyword of pattern.keywords) {
      const keywordTokens = keyword.split(' ').filter((w) => w && !STOP_WORDS.has(w));
      if (keywordTokens.length === 0) continue;
      const overlap = keywordTokens.filter((t) => queryTokens.has(t)).length;
      if (overlap === 0) continue;
      const score = overlap / keywordTokens.length;
      if (score > bestScoreForPattern) bestScoreForPattern = score;
    }
    if (bestScoreForPattern > 0) {
      results.push({ pattern, score: bestScoreForPattern });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

// --------------------------------------------------------------------------
// 6) الاقتراحات الذكية (Smart Suggestions)
// --------------------------------------------------------------------------
// بدل ما نعرض "لم أفهم السؤال" بدون فايدة، بنقترح أقرب الأوامر المحتملة
function buildSuggestions(scored: { pattern: QueryPattern; score: number }[]): string[] {
  const seen = new Set<string>();
  const suggestions: string[] = [];

  for (const { pattern } of scored) {
    if (seen.has(pattern.id)) continue;
    seen.add(pattern.id);
    suggestions.push(pattern.examples[0]);
    if (suggestions.length >= 5) break;
  }

  // لو مفيش أي تطابق جزئي على الإطلاق (سؤال عام جدًا أو فارغ من الكلمات
  // المميزة)، بنعرض مجموعة الأوامر الأكثر استخدامًا كنقطة انطلاق
  if (suggestions.length === 0) {
    return DEFAULT_SUGGESTIONS;
  }

  // نكمّل بباقي الاقتراحات الافتراضية لو العدد أقل من 3 عشان الاختيارات تكون كفاية
  for (const s of DEFAULT_SUGGESTIONS) {
    if (suggestions.length >= 3) break;
    if (!suggestions.includes(s)) suggestions.push(s);
  }

  return suggestions;
}

// --------------------------------------------------------------------------
// 7) نقطة الدخول الرئيسية
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
  const scored = scoreAllPatterns(raw);
  const best = scored[0];
  if (best && best.score >= 0.5) {
    return best.pattern.run(user);
  }

  // المرحلة 4: لم نتأكد من النية - نعرض اقتراحات ذكية بدل رسالة خطأ عقيمة
  const suggestions = buildSuggestions(scored);
  return {
    title: '🤔 هل تقصد أحد هذه الأوامر؟',
    lines: suggestions,
    suggestions
  };
}
