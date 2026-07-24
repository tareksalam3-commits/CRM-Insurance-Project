import { useEffect, useRef } from 'react';
import { subscribeNetwork } from '../lib/networkManager';

// ===================================
// هوك مشترك: يستدعي الدوال المُمررة له تلقائياً فقط عند رجوع الاتصال
// بعد انقطاع فعلي (Disconnected → Connected)، بدون أي حاجة لعمل Refresh
// يدوي أو إعادة فتح الصفحة أو الرجوع لها.
//
// ليه هوك مشترك واحد بدل ما كل صفحة تكتب منطقها الخاص:
// كانت كل صفحة (useCustomers, usePolicies, useDashboard...) تجيب
// بياناتها مرة واحدة فقط عند mount (أو تغيّر الفلاتر)، وما فيه أي مستمع
// لعودة الاتصال — فلو الصفحة فُتحت وقت انقطاع مؤقت أو قبل ما يتأكد
// الاتصال، تفضل عارضة بيانات فاضية/قديمة لحد ما المستخدم يعمل Refresh
// بنفسه (وهي بالضبط المشكلة المطلوب حلها). الحل المركزي هنا يضمن نفس
// السلوك تلقائياً فى كل صفحة تستخدمه، بمنطق واحد فقط.
//
// ملحوظة: التنفيذ الفعلي عند أول تحميل (mount) يفضل مسؤولية useEffect
// الخاص بكل صفحة كما هو (فيه فلاتر/صفحات مختلفة)، وهذا الهوك بيغطي فقط
// حالة "رجوع الاتصال بعد ما كان مقطوع فعلياً" حتى لا نكرر الطلبات بلا
// داعٍ عند كل mount عادي.
// ===================================
export function useReconnectRefetch(...callbacks: Array<() => void>): void {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const wasDisconnected = useRef(false);

  useEffect(() => {
    const unsubscribe = subscribeNetwork((snapshot) => {
      if (snapshot.state === 'disconnected') {
        wasDisconnected.current = true;
        return;
      }
      if (snapshot.state === 'connected' && wasDisconnected.current) {
        wasDisconnected.current = false;
        for (const cb of callbacksRef.current) cb();
      }
    });
    return unsubscribe;
  }, []);
}
