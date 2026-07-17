import { useEffect, useState } from 'react';
import { subscribeNetwork, type ConnectionState } from '../lib/networkManager';

export type { ConnectionState };

// ===================================
// هوك رفيع (thin) بيقرأ من الـ Network Manager المركزي فقط — مفيش أي
// قناة Realtime أو Interval بيتنشئ هنا. كل الاستدعاءات لِـ useConnectionStatus
// فى أي مكان بالتطبيق (Sidebar, Header, ...) بتشترك فى نفس المصدر الواحد
// فقط، فمفيش تكرار اتصالات.
// ===================================
export function useConnectionStatus() {
  const [state, setState] = useState<ConnectionState>('connected');
  const [lastSyncAt, setLastSyncAt] = useState<number>(Date.now());
  const [, forceTick] = useState(0);

  useEffect(() => {
    const unsubscribe = subscribeNetwork((snapshot) => {
      setState(snapshot.state);
      setLastSyncAt(snapshot.lastSyncAt);
    });

    // تحديث دوري كل نص دقيقة عشان نص "من كام دقيقة" يفضل حي وصحيح
    // (تحديث للعرض فقط، مش بيعمل أي طلب شبكة أو اتصال جديد)
    const tickInterval = setInterval(() => forceTick((t) => t + 1), 30000);

    return () => {
      unsubscribe();
      clearInterval(tickInterval);
    };
  }, []);

  const minutesAgo = Math.max(0, Math.floor((Date.now() - lastSyncAt) / 60000));

  return { state, minutesAgo };
}
