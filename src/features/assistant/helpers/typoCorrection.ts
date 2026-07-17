import { normalizeArabic, STOP_WORDS } from './textNormalization';
import { NORMALIZED_PATTERNS } from '../constants';

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
export function correctText(text: string): string {
  return text
    .split(' ')
    .map((w) => (STOP_WORDS.has(w) ? w : correctWord(w)))
    .join(' ');
}

export function tokenize(text: string): string[] {
  return normalizeArabic(text)
    .split(' ')
    .filter((w) => w && !STOP_WORDS.has(w))
    .map((w) => correctWord(w));
}
