// ===================================
// ناقل أحداث بسيط لإشعارات طابور الأوفلاين — أي شاشة/مكوّن ممكن يسمع
// الأحداث دي (زي OfflineToast) من غير ما نربط منطق العمليات نفسه بأي
// مكوّن واجهة بعينه.
//
// نقطة مركزية واحدة لمنع تكرار الإشعارات: بدل ما كل مكان بينادي
// emitOfflineEvent يعمل throttle خاص بيه (كان فيه تكرار منطق قبل كده)،
// هنا مكان واحد يتحكم إن كل "نوع" إشعار (فقد اتصال / بدء مزامنة / نجاح
// مزامنة / تعارض / بيانات من الكاش) ميتكررش خلال فترة قصيرة، حتى لو
// استُدعي من أكتر من مكان فى نفس اللحظة تقريباً.
// ===================================

export type OfflineEventKind = 'queued' | 'sync-started' | 'synced' | 'conflict' | 'data-cached';

export interface OfflineEventDetail {
  kind: OfflineEventKind;
  message: string;
}

const target = new EventTarget();
const EVENT_NAME = 'offline-queue-event';

// نافذة زمنية لمنع تكرار نفس "نوع" الإشعار — تعارض (conflict) مستثناة
// عمداً لأنها لازم توصل كل مرة (كل تعارض عملية مختلف ومهم يوصل بمفرده)
const THROTTLE_MS: Partial<Record<OfflineEventKind, number>> = {
  'data-cached': 4000,
  queued: 4000,
  'sync-started': 2000,
  synced: 2000,
};
const lastEmittedAt: Partial<Record<OfflineEventKind, number>> = {};

export function emitOfflineEvent(kind: OfflineEventKind, message: string): void {
  const throttleMs = THROTTLE_MS[kind];
  if (throttleMs) {
    const now = Date.now();
    const last = lastEmittedAt[kind] || 0;
    if (now - last < throttleMs) return;
    lastEmittedAt[kind] = now;
  }
  target.dispatchEvent(new CustomEvent<OfflineEventDetail>(EVENT_NAME, { detail: { kind, message } }));
}

export function subscribeOfflineEvents(listener: (detail: OfflineEventDetail) => void): () => void {
  const handler = (e: Event) => listener((e as CustomEvent<OfflineEventDetail>).detail);
  target.addEventListener(EVENT_NAME, handler);
  return () => target.removeEventListener(EVENT_NAME, handler);
}
