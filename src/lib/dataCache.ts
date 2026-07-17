import { idbGet, idbPut, idbDelete, idbClearStore, DATA_CACHE_STORE } from './offlineDb';

// ===================================
// كاش عام لآخر نسخة ناجحة من أي استدعاء قراءة بيانات. لا يُستخدم مباشرة
// من الصفحات أو الـ Services — فقط من dataAccessLayer.ts.
//
// ملاحظة عن الـ key: لازم يتضمن كل ما يجعل النتيجة مختلفة (معرّف المستخدم،
// الصفحة، الفلاتر...)، لأن بيانات كل صف مقيدة أصلاً بصلاحيات RLS الخاصة
// بالمستخدم. نعتمد على clearAllDataCache() عند تسجيل الخروج كخط دفاع
// إضافي حتى لا تتسرب بيانات مستخدم لمستخدم آخر على نفس الجهاز.
// ===================================

export interface CacheEntry<T> {
  key: string;
  value: T;
  updatedAt: number;
}

export async function getCachedData<T>(key: string): Promise<CacheEntry<T> | null> {
  try {
    const entry = await idbGet<CacheEntry<T>>(DATA_CACHE_STORE, key);
    return entry ?? null;
  } catch {
    // فشل قراءة الكاش نفسه (مثلاً IndexedDB غير متاح) لا يجب أن يوقف التطبيق
    return null;
  }
}

export async function setCachedData<T>(key: string, value: T): Promise<void> {
  try {
    await idbPut<CacheEntry<T>>(DATA_CACHE_STORE, { key, value, updatedAt: Date.now() });
  } catch {
    // فشل الكتابة فى الكاش مش المفروض يكسر تدفق البيانات نفسه
  }
}

export async function clearCachedEntry(key: string): Promise<void> {
  try {
    await idbDelete(DATA_CACHE_STORE, key);
  } catch {
    // تجاهل
  }
}

// تُستدعى عند تسجيل الخروج فقط
export async function clearAllDataCache(): Promise<void> {
  try {
    await idbClearStore(DATA_CACHE_STORE);
  } catch {
    // تجاهل
  }
}
