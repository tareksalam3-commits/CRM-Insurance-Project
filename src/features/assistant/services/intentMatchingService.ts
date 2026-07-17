import type { QueryPattern } from '../types';
import { STOP_WORDS } from '../helpers/textNormalization';
import { tokenize } from '../helpers/typoCorrection';
import { NORMALIZED_PATTERNS, DEFAULT_SUGGESTIONS } from '../constants';

// --------------------------------------------------------------------------
// 5) المطابقة والترتيب (Matching & Ranking)
// --------------------------------------------------------------------------
export function findDirectMatch(normalizedText: string): QueryPattern | null {
  const found = NORMALIZED_PATTERNS.find((p) => p.keywords.some((k) => normalizedText.includes(k)));
  return found || null;
}

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

// --------------------------------------------------------------------------
// 6) الاقتراحات الذكية (Smart Suggestions)
// --------------------------------------------------------------------------
// بدل ما نعرض "لم أفهم السؤال" بدون فايدة، بنقترح أقرب الأوامر المحتملة
export function buildSuggestions(scored: { pattern: QueryPattern; score: number }[]): string[] {
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
