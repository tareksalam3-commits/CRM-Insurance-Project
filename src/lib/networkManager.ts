import { supabase } from './supabase';
import { emitOfflineEvent } from './offlineEvents';

// ===================================
// Network Manager — مصدر واحد مركزي لحالة الاتصال بالإنترنت لكل التطبيق.
//
// ليه ده مهم:
// كان فيه أكتر من مكوّن (Sidebar + Header) بيعملوا mount لنفس الهوك
// useConnectionStatus، وكل mount كان بينشئ قناة Supabase Realtime جديدة
// بنفس الاسم ('connection-status-watch') + setInterval مستقل خاص بيه.
// النتيجة: قنوات مكررة، اتصالات Socket زيادة، واستهلاك CPU/Battery أعلى
// من اللازم على الأجهزة الضعيفة — من غير أي فايدة حقيقية.
//
// الحل: قناة واحدة فقط + مستمع واحد لـ online/offline يتم إنشاؤهم مرة
// واحدة فقط (Lazy، أول ما حد يشترك)، وكل الأجزاء التانية في التطبيق بس
// "تشترك" في نفس الحالة المشتركة دي بدل ما تعمل مصدر جديد.
// ===================================

export type ConnectionState = 'connected' | 'disconnected' | 'error';

interface NetworkSnapshot {
  state: ConnectionState;
  lastSyncAt: number; // epoch ms - آخر مرة اتأكدنا فيها إن الاتصال شغال فعلاً
}

type Listener = (snapshot: NetworkSnapshot) => void;

let snapshot: NetworkSnapshot = {
  state: typeof navigator !== 'undefined' && navigator.onLine === false ? 'disconnected' : 'connected',
  lastSyncAt: Date.now(),
};

const listeners = new Set<Listener>();
let started = false;
let realtimeChannel: ReturnType<typeof supabase.channel> | null = null;

function notify(): void {
  for (const listener of listeners) listener(snapshot);
}

function setState(state: ConnectionState, opts: { touchSync?: boolean } = {}): void {
  const touchSync = opts.touchSync ?? state === 'connected';
  if (snapshot.state === state && !touchSync) return;
  const wasConnected = snapshot.state !== 'disconnected';
  snapshot = {
    state,
    lastSyncAt: touchSync ? Date.now() : snapshot.lastSyncAt,
  };
  // إشعار واحد بس عند فقد الاتصال فعلياً (أول انتقال من متصل لغير متصل)،
  // مش عند كل فحص دوري للحالة نفسها
  if (state === 'disconnected' && wasConnected) {
    emitOfflineEvent('data-cached', 'لا يوجد اتصال بالإنترنت.');
  }
  notify();
}

// يبدأ المراقبة الفعلية مرة واحدة بس طول عمر التطبيق (lazy singleton) —
// أول مشترك (subscribe) هو اللي بيشغّلها، مفيش تكرار مهما اشترك عدد
// كبير من المكونات فى نفس الوقت.
function ensureStarted(): void {
  if (started) return;
  started = true;

  const handleOnline = () => setState('connected');
  const handleOffline = () => setState('disconnected');
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // قناة خفيفة واحدة فقط لمراقبة صحة اتصال Supabase Realtime (بدون
  // الاشتراك فى أي بيانات فعلية من أي جدول)
  try {
    realtimeChannel = supabase.channel('connection-status-watch');
    realtimeChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setState('connected');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setState('error', { touchSync: false });
      } else if (status === 'CLOSED') {
        setState('disconnected', { touchSync: false });
      }
    });
  } catch {
    // فشل إنشاء القناة نفسه مش المفروض يوقف التطبيق — الاعتماد على
    // online/offline events هيفضل شغال برضه
  }
}

export function subscribeNetwork(listener: Listener): () => void {
  ensureStarted();
  listeners.add(listener);
  // ابعت الحالة الحالية فوراً عند الاشتراك
  listener(snapshot);
  return () => {
    listeners.delete(listener);
  };
}

export function getNetworkSnapshot(): NetworkSnapshot {
  return snapshot;
}

export function isOnline(): boolean {
  return snapshot.state !== 'disconnected';
}
