import { idbGetAll, idbPut, idbDelete, QUEUE_STORE } from './offlineDb';
import { emitOfflineEvent } from './offlineEvents';
import { isOnline as isOnlineFromNetworkManager } from './networkManager';

// ===================================
// العمليات المدعومة فى Offline Queue فقط — أي عملية تانية مش موجودة هنا
// عمداً (النظام مصمم يشتغل أوفلاين لعمليات محددة وحساسة فقط، راجع الطلب)
// ===================================
export type OfflineOperationType =
  | 'pay_installment'
  | 'cancel_installment'
  | 'add_customer'
  | 'add_policy';

export interface OfflineQueueItem<TPayload = unknown> {
  operationId: string;
  type: OfflineOperationType;
  payload: TPayload;
  userId: string;
  createdAt: number;
  attempts: number;
  lastError?: string;
}

const QUEUED_NOTICE = 'تم حفظ العملية وسيتم تنفيذها تلقائياً عند عودة الاتصال.';
const SYNC_STARTED_NOTICE = 'جاري مزامنة العمليات المعلّقة...';
const SYNCED_NOTICE = 'تمت مزامنة العملية بنجاح.';

// نفس مصدر حالة الاتصال المركزي المستخدم فى باقي التطبيق (networkManager)
// — لا تكرار لمنطق فحص الاتصال، ولضمان إن "عودة الإنترنت" اللي بتشغّل
// المزامنة هنا هي نفسها اللي بتشغّل إعادة محاولة القراءة فى DAL
export function isOnline(): boolean {
  return isOnlineFromNetworkManager();
}

// خطأ شبكة (مفيش إنترنت فعلياً وقت تنفيذ الطلب) وليس خطأ عمل/تحقق راجع من
// السيرفر — الفرق مهم عشان لا نحوّل خطأ تحقق (زي "الشهر مقفل") لعملية Queue
export function isNetworkError(err: unknown): boolean {
  if (!isOnline()) return true;
  const message = (err as { message?: string })?.message?.toLowerCase() || '';
  return (
    message.includes('failed to fetch') ||
    message.includes('network') ||
    message.includes('load failed') ||
    err instanceof TypeError
  );
}

export async function getQueueItems(): Promise<OfflineQueueItem[]> {
  return idbGetAll<OfflineQueueItem>(QUEUE_STORE);
}

export async function getQueueCount(): Promise<number> {
  return (await getQueueItems()).length;
}

export async function removeQueueItem(operationId: string): Promise<void> {
  await idbDelete(QUEUE_STORE, operationId);
}

async function enqueueOperation<TPayload>(
  operationId: string,
  type: OfflineOperationType,
  payload: TPayload,
  userId: string,
): Promise<void> {
  const item: OfflineQueueItem<TPayload> = {
    operationId,
    type,
    payload,
    userId,
    createdAt: Date.now(),
    attempts: 0,
  };
  await idbPut(QUEUE_STORE, item);
  emitOfflineEvent('queued', QUEUED_NOTICE);
}

export async function markQueueAttemptFailed(operationId: string, error: string): Promise<void> {
  const items = await getQueueItems();
  const item = items.find((i) => i.operationId === operationId);
  if (!item) return;
  item.attempts += 1;
  item.lastError = error;
  await idbPut(QUEUE_STORE, item);
}

export function notifySyncStarted(): void {
  emitOfflineEvent('sync-started', SYNC_STARTED_NOTICE);
}

export function notifySynced(): void {
  emitOfflineEvent('synced', SYNCED_NOTICE);
}

export function notifyConflict(message: string): void {
  emitOfflineEvent('conflict', message);
}

// ===================================
// الغلاف الموحّد: يُستخدم داخل كل خدمة من الأربعة المدعومة (سداد/إلغاء
// سداد/إضافة عميل/إضافة وثيقة) بدون تغيير أي منطق عمل. لو مفيش إنترنت (أو
// فشل الطلب لسبب شبكة) بيحفظ العملية فى الطابور المحلي ويرجّع بهدوء بدل ما
// يرمي خطأ، فالشاشة تتصرف كأنها نجحت (تقفل المودال) مع ظهور إشعار Offline.
// أي خطأ تاني (تحقق/تعارض من السيرفر) بيتمرر زي ما هو للمستخدم زي الأول.
// ===================================
export async function withOfflineQueue<TPayload, TResult>(
  operationId: string,
  type: OfflineOperationType,
  payload: TPayload,
  userId: string,
  execute: (operationId: string) => Promise<TResult>,
  fallbackResult: TResult,
): Promise<TResult> {
  if (!isOnline()) {
    await enqueueOperation(operationId, type, payload, userId);
    return fallbackResult;
  }

  try {
    return await execute(operationId);
  } catch (err) {
    if (isNetworkError(err)) {
      await enqueueOperation(operationId, type, payload, userId);
      return fallbackResult;
    }
    throw err;
  }
}
