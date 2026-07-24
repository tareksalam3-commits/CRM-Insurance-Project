import type { QueryPattern } from '../types';
import { STOP_WORDS } from '../helpers/textNormalization';
import { tokenize } from '../helpers/typoCorrection';
import { NORMALIZED_PATTERNS } from '../constants';

// --------------------------------------------------------------------------
// ترتيب الأنماط حسب التشابه مع سؤال المستخدم - بيُستخدم فقط لتخمين "نية"
// السؤال (Intent) عشان نجيب معاه بيانات حقيقية كسياق للذكاء الاصطناعي.
// مبيرجعش رد جاهز ومبيتعرضش كاقتراح مكتوب للمستخدم.
// --------------------------------------------------------------------------
// بيحسب لكل الأنماط درجة تشابه مع سؤال المستخدم (نسبة الكلمات المشتركة)
// ويرجع الكل مرتبين تنازليًا حسب الأقرب، عشان نقدر نبني منهم اقتراحات ذكية
export function scoreAllPatterns(query: string): { pattern: QueryPattern; score: number }[] {
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
      // كلمات مفتاحية قصيرة (كلمة أو كلمتين) لازم تتطابق بالكامل - وإلا كلمة
      // عامة زي "الفريق" أو "اليوم" لوحدها هتدي تطابق زائف مع أي سؤال عام
      // بيشاركها نفس الكلمة الشائعة دي بس مش نفس المعنى فعلاً (زي "حلل أرقام
      // الفريق" اللي كان بيتطابق غلط مع "عدد الفريق").
      if (keywordTokens.length <= 2 && overlap < keywordTokens.length) continue;
      const score = overlap / keywordTokens.length;
      if (score > bestScoreForPattern) bestScoreForPattern = score;
    }
    if (bestScoreForPattern > 0) {
      results.push({ pattern, score: bestScoreForPattern });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}
