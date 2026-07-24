import { isOnline } from './networkManager';
import { getCachedData, setCachedData } from './dataCache';
import { emitOfflineEvent } from './offlineEvents';

// ===================================
// Data Access Layer (DAL) — نقطة مرور واحدة إجبارية لأي عملية "قراءة"
// بيانات فى التطبيق (كل ما هو fetch/get/list من Supabase).
//
// ليه ده مهم (المشكلة الجذرية اللي بنحلها):
// كل Service كان بينادي supabase مباشرة، فكل صفحة كانت بتتصرف بشكل مختلف
// عند فقد الاتصال: بعضها بيفضل فى Loading للأبد، بعضها بيرمي خطأ يهرب من
// try/catch الخاص بيه ويوصل لـ ErrorBoundary (شاشة بيضاء/رسالة عطل)،
// وبعضها بيرجّع مصفوفة فاضية بصمت من غير أي إشعار للمستخدم.
//
// الحل: كل دالة قراءة فى كل Service تتلف بـ dalRead() بدل ما تنفذ منطقها
// مباشرة. dalRead():
//   1. بتتأكد من حالة الاتصال (عبر networkManager، نفس المصدر المستخدم فى
//      باقي التطبيق - لا تكرار لمنطق فحص الاتصال).
//   2. لو فيه إنترنت: بتنفذ الاستعلام الحقيقي بحد أقصى للوقت (Timeout) حتى
//      لا يتعلق الـ Loading للأبد لو الشبكة بطيئة/متقطعة. لو نجح، بتحفظ
//      النتيجة فى الكاش المحلي (IndexedDB) وترجعها.
//   3. لو مفيش إنترنت، أو فشل الاستعلام لسبب شبكة، أو حصل Timeout:
//      بترجع آخر نسخة محفوظة فى الكاش المحلي لنفس الـ key لو موجودة
//      (Offline State له بيانات)، أو قيمة فاضية موحدة الشكل لو مفيش كاش
//      أصلاً (Offline State فاضي) - وفى الحالتين بترسل حدث موحد
//      (offlineEvents) بدل ما تسيب كل صفحة تتصرف لوحدها.
//   4. لو الخطأ حقيقي (مش شبكة - مثلاً صلاحيات/منطق فى السيرفر): بتحاول
//      كمان ترجع آخر كاش متاح كحل أخير قبل الرجوع لقيمة فاضية، حتى
//      لا تتحول أي مشكلة عارضة فى استعلام واحد لشاشة بيضاء.
//
// dalRead() لا "ترمي" استثناء أبداً (إلا لو الـ fetcher نفسه استُخدم مباشرة
// بدون DAL فى مكان آخر) — دايماً بترجع نتيجة صالحة الشكل، وده اللي بيمنع
// الانهيار (Crash) والـ Loading اللانهائي تلقائياً فى أي صفحة بتستخدمها،
// من غير ما الصفحة نفسها تحتاج تكتب أي منطق إضافي.
// ===================================

export type DalStatus =
  | 'online'         // البيانات جاية فعلياً من Supabase الآن
  | 'offline-cache'  // مفيش اتصال (أو فشل شبكة) لكن فيه نسخة محفوظة محلياً
  | 'offline-empty'  // مفيش اتصال ومفيش أي نسخة محفوظة محلياً بعد
  | 'error-cache'    // خطأ حقيقي (مش شبكة) لكن رجّعنا آخر نسخة محفوظة كحل أخير
  | 'error';         // خطأ حقيقي ومفيش أي نسخة محفوظة لنرجعها

export interface DalResult<T> {
  data: T;
  status: DalStatus;
  /** true لو البيانات المرجعة مش طازة (كاش قديم) */
  isStale: boolean;
  /** وقت آخر تحديث ناجح للكاش، أو null لو مفيش كاش أصلاً */
  cachedAt: number | null;
  errorMessage?: string;
}

export interface DalOptions<T> {
  /** القيمة المرجعة لو مفيش بيانات إطلاقاً (لا Online ولا كاش) — لازم تكون بنفس شكل T دايماً (مصفوفة فاضية، كائن بأصفار...) حتى لا تنهار الصفحة عند العرض */
  emptyValue: T;
  /** أقصى وقت انتظار للاستعلام الحقيقي قبل اعتباره فشل شبكة (افتراضي 15 ثانية) */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 15000;
// إعادة محاولة تلقائية للفشل "المؤقت" فقط (شبكة/Timeout) قبل الرجوع
// للكاش أو رسالة الخطأ — بدون أي تدخل من المستخدم (متطلب رقم 3)
const MAX_AUTO_RETRIES = 2;
const RETRY_BASE_DELAY_MS = 500;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ملحوظة: منع تكرار إشعار "بيانات محفوظة محلياً" مركزي دلوقتي داخل
// emitOfflineEvent نفسها (lib/offlineEvents.ts) بدل ما يتكرر منطق الـ
// throttle هنا كمان — راجع THROTTLE_MS هناك.
function notifyOffline(message: string): void {
  emitOfflineEvent('data-cached', message);
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('DAL_TIMEOUT')), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      },
    );
  });
}

// خطأ "شبكة" (يستحق الرجوع للكاش بهدوء) وليس خطأ عمل/تحقق حقيقي راجع من
// السيرفر — نفس فكرة isNetworkError الموجودة أصلاً فى offlineQueue.ts
function isNetworkLikeError(err: unknown): boolean {
  if (!isOnline()) return true;
  const message = (err as { message?: string })?.message?.toLowerCase() || '';
  return (
    message.includes('dal_timeout') ||
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('load failed') ||
    err instanceof TypeError
  );
}

// تنفذ الاستعلام الحقيقي وتعيد المحاولة تلقائياً (بحد أقصى MAX_AUTO_RETRIES)
// فقط لو الفشل يبدو "مؤقت" (شبكة/Timeout) — خطأ حقيقي راجع من السيرفر
// (صلاحيات/تحقق) بيتمرر فوراً من غير أي محاولة إضافية، لأن تكراره مش
// هيغيّر النتيجة وبس هيأخر ظهور الخطأ الحقيقي للمستخدم بلا داعٍ.
async function fetchWithAutoRetry<T>(fetcher: () => Promise<T>, timeoutMs: number): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= MAX_AUTO_RETRIES; attempt++) {
    try {
      return await withTimeout(fetcher(), timeoutMs);
    } catch (err) {
      lastErr = err;
      if (!isNetworkLikeError(err) || attempt === MAX_AUTO_RETRIES) break;
      await sleep(RETRY_BASE_DELAY_MS * (attempt + 1));
    }
  }
  throw lastErr;
}

function minutesAgoLabel(cachedAt: number): string {
  const minutes = Math.max(0, Math.floor((Date.now() - cachedAt) / 60000));
  if (minutes < 1) return 'أقل من دقيقة';
  if (minutes === 1) return 'دقيقة واحدة';
  return `${minutes} دقيقة`;
}

/**
 * نقطة المرور الموحدة لأي عملية قراءة بيانات. كل دالة "قراءة" فى أي
 * Service يجب أن تلف منطقها الحالي بهذه الدالة بدل ما تنادي Supabase
 * مباشرة وترجّع نتيجته كما هو.
 *
 * @param key معرّف فريد وثابت لهذه القراءة بالذات (لازم يتضمن أي فلاتر/صفحة/معرّف
 *            مستخدم تؤثر فى النتيجة، مثال: `customers:list:${page}:${searchQuery}:${userId}`)
 * @param fetcher الدالة اللي بتنفذ الاستعلام الحقيقي (نفس المنطق الحالي بالظبط)
 * @param options.emptyValue القيمة الافتراضية عند عدم وجود بيانات إطلاقاً
 */
export async function dalRead<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: DalOptions<T>,
): Promise<DalResult<T>> {
  const { emptyValue, timeoutMs = DEFAULT_TIMEOUT_MS } = options;

  // (1) مفيش إنترنت من الأساس — منروحش نستنى أي Timeout، نرجع الكاش فوراً
  if (!isOnline()) {
    const cached = await getCachedData<T>(key);
    if (cached) {
      notifyOffline(`لا يوجد اتصال بالإنترنت — تُعرض بيانات محفوظة من ${minutesAgoLabel(cached.updatedAt)}.`);
      return { data: cached.value, status: 'offline-cache', isStale: true, cachedAt: cached.updatedAt };
    }
    notifyOffline('لا يوجد اتصال بالإنترنت ولا توجد بيانات محفوظة لعرضها.');
    return { data: emptyValue, status: 'offline-empty', isStale: false, cachedAt: null };
  }

  // (2) فيه إنترنت (ظاهرياً على الأقل) — ننفذ الاستعلام الحقيقي بحد أقصى للوقت
  try {
    const data = await fetchWithAutoRetry(fetcher, timeoutMs);
    // نحفظ الكاش بدون انتظار الكتابة (لا تعطّل استجابة الصفحة)
    void setCachedData(key, data);
    return { data, status: 'online', isStale: false, cachedAt: Date.now() };
  } catch (err) {
    console.error(`[DAL:${key}]`, err);

    const cached = await getCachedData<T>(key);

    if (isNetworkLikeError(err)) {
      if (cached) {
        notifyOffline(`تعذر الاتصال بالخادم — تُعرض بيانات محفوظة من ${minutesAgoLabel(cached.updatedAt)}.`);
        return { data: cached.value, status: 'offline-cache', isStale: true, cachedAt: cached.updatedAt, errorMessage: 'network' };
      }
      notifyOffline('تعذر الاتصال بالخادم ولا توجد بيانات محفوظة لعرضها.');
      return { data: emptyValue, status: 'offline-empty', isStale: false, cachedAt: null, errorMessage: 'network' };
    }

    // خطأ حقيقي (صلاحيات/منطق سيرفر) — نحاول الكاش كحل أخير بدل شاشة بيضاء
    const errorMessage = (err as Error)?.message || 'حدث خطأ غير متوقع أثناء تحميل البيانات';
    if (cached) {
      return { data: cached.value, status: 'error-cache', isStale: true, cachedAt: cached.updatedAt, errorMessage };
    }
    return { data: emptyValue, status: 'error', isStale: false, cachedAt: null, errorMessage };
  }
}

/** true لو الحالة تعتبر "معطّلة" (محتاجة تنبيه/بانر فى الواجهة) */
export function isDegradedStatus(status: DalStatus): boolean {
  return status !== 'online';
}
