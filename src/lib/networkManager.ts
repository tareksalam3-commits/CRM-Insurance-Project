import { supabase } from './supabase';
import { emitOfflineEvent } from './offlineEvents';

// رابط خفيف جداً (health endpoint فى Supabase) نستخدمه فقط للتأكد من وجود
// اتصال إنترنت *فعلي* — نفس فكرة "ping". نعتمد عليه لأن navigator.onLine
// (وحدثي online/offline المبنيين عليه) بيعكسوا بس حالة "كارت الشبكة" فى
// الجهاز (متصل بالراوتر/الشريحة) مش وجود إنترنت فعلي، وعلى الموبايل
// (خصوصاً داخل WebView/تطبيقات مغلّفة) الحدثين ده كتير ما بيتطلقوش أصلاً
// لما المستخدم يقفل/يفتح الواي فاي أو البيانات يدوياً من الجهاز.
const HEALTH_CHECK_URL = `${import.meta.env.VITE_SUPABASE_URL}/auth/v1/health`;
const POLL_WHILE_DISCONNECTED_MS = 4000;

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
  if (state === 'connected') {
    stopPolling();
  }
  notify();
}

// فحص اتصال حقيقي (مش مجرد قراءة navigator.onLine) — طلب صغير جداً بـ
// timeout قصير. بيرجع true لو فعلاً وصلنا للسيرفر، false غير كده (بما
// فيها أي خطأ شبكة أو انتهاء وقت).
async function probeRealConnectivity(): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    await fetch(HEALTH_CHECK_URL, { method: 'GET', cache: 'no-store', signal: controller.signal });
    clearTimeout(timer);
    return true;
  } catch {
    return false;
  }
}

let pollTimer: ReturnType<typeof setInterval> | null = null;

// بيشتغل بس وإحنا فى حالة 'disconnected' — يحاول كل بضع ثوانٍ يتأكد هل
// فعلاً الإنترنت رجع؟ ده اللي بيحل مشكلة "المستخدم قفل الواي فاي وفتحه
// تاني والتطبيق فاضل شايف إنه لسه مقطوع": مش لازم نستنى حدث 'online' من
// المتصفح (اللي ممكن ميتطلقش أصلاً على بعض الأجهزة)، إحنا اللي بنتأكد بنفسنا.
function ensurePolling(): void {
  if (pollTimer) return;
  pollTimer = setInterval(async () => {
    if (snapshot.state !== 'disconnected') {
      stopPolling();
      return;
    }
    const reallyOnline = await probeRealConnectivity();
    if (reallyOnline) {
      setState('connected');
    }
  }, POLL_WHILE_DISCONNECTED_MS);
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

// يبدأ المراقبة الفعلية مرة واحدة بس طول عمر التطبيق (lazy singleton) —
// أول مشترك (subscribe) هو اللي بيشغّلها، مفيش تكرار مهما اشترك عدد
// كبير من المكونات فى نفس الوقت.
function ensureStarted(): void {
  if (started) return;
  started = true;

  const handleOnline = () => setState('connected');
  const handleOffline = () => {
    setState('disconnected');
    ensurePolling();
  };
  window.addEventListener('online', handleOnline);
  window.addEventListener('offline', handleOffline);

  // لما نبدأ ونحن أصلاً 'disconnected' (مثلاً الصفحة اتفتحت والواي فاي
  // مقفول من الأساس) لازم نبدأ نحاول نتأكد بأنفسنا كمان من أول لحظة،
  // مش بس نستنى حدث 'online' اللي ممكن ميوصلش
  if (snapshot.state === 'disconnected') {
    ensurePolling();
  }

  // لما التطبيق يرجع للـ foreground (المستخدم فتح الواي فاي وهو بره
  // التطبيق مثلاً ثم رجعله) نتأكد فوراً بدل ما ننتظر الدورة الزمنية العادية
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && snapshot.state === 'disconnected') {
      probeRealConnectivity().then((reallyOnline) => {
        if (reallyOnline) setState('connected');
      });
    }
  });
  window.addEventListener('focus', () => {
    if (snapshot.state === 'disconnected') {
      probeRealConnectivity().then((reallyOnline) => {
        if (reallyOnline) setState('connected');
      });
    }
  });

  subscribeRealtimeChannel();
}

// جذر مشكلة "تعذر التحميل رغم وجود إنترنت" الأصلية: كان إقفال قناة
// الـ Realtime (CLOSED/CHANNEL_ERROR/TIMED_OUT) بيحوّل حالة الاتصال
// لـ 'disconnected' مباشرة، وده كان بيخلي dalRead يرجع للكاش/الفاضي على
// طول من غير ما يحاول يجيب البيانات الحقيقية أصلاً — رغم إن انقطاع
// القناة نفسها له أسباب كتير غير متعلقة بوجود إنترنت فعلاً (تجديد Auth
// Token، توفير طاقة/إيقاف الأنشطة فى الخلفية على الموبايل، Proxy شركات
// بيحجب WebSocket بس مش HTTPS، إعادة تشغيل قصيرة فى خدمة الـ Realtime
// نفسها...). لذلك دلوقتي: القناة لا تُستخدم إطلاقاً لتعيين 'disconnected'
// — المصدر الوحيد لده هو حدث 'offline' الحقيقي من المتصفح. القناة فقط
// بترفع الحالة لـ 'connected' بسرعة أكبر، وبتحاول تعيد الاتصال بهدوء فى
// الخلفية لو انقطعت، بدون أي تأثير على حالة الاتصال المعروضة للمستخدم.
function subscribeRealtimeChannel(): void {
  try {
    realtimeChannel = supabase.channel('connection-status-watch');
    realtimeChannel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setState('connected');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        // بنعيد المحاولة دايماً (من غير ما نشترط navigator.onLine) — الاعتماد
        // على navigator.onLine هنا كان بيوقف كل محاولات إعادة الاتصال للأبد
        // لو القناة اتقفلت وإحنا فعلاً أوفلاين، لأن مفيش حد تاني بيعيد
        // استدعاء الدالة دي تانى بعد كده. لو لسه أوفلاين فعلاً المحاولة
        // هتفشل بسرعة وهتتعاد تلقائياً كل 5 ثواني بدون أي تأثير حقيقي على
        // الأداء أو الحالة المعروضة للمستخدم.
        setTimeout(() => {
          try {
            realtimeChannel?.unsubscribe();
          } catch {
            // تجاهل
          }
          subscribeRealtimeChannel();
        }, 5000);
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
