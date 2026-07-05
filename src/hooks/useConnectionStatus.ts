import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type ConnectionState = 'connected' | 'disconnected' | 'error';

export function useConnectionStatus() {
  const [state, setState] = useState<ConnectionState>('connected');
  const [lastSyncAt, setLastSyncAt] = useState<Date>(new Date());
  const [, forceTick] = useState(0);

  useEffect(() => {
    // قناة خفيفة جدًا هدفها الوحيد مراقبة حالة اتصال Supabase Realtime،
    // مش بتحمل أو تشترك في أي بيانات فعلية من الجداول
    const channel = supabase.channel('connection-status-watch');

    channel.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        setState('connected');
        setLastSyncAt(new Date());
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        setState('error');
      } else if (status === 'CLOSED') {
        setState('disconnected');
      }
    });

    // متابعة حالة اتصال الجهاز نفسه بالإنترنت كمان
    const handleOnline = () => {
      setState('connected');
      setLastSyncAt(new Date());
    };
    const handleOffline = () => setState('disconnected');

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // تحديث دوري كل نص دقيقة عشان نص "من كام دقيقة" يفضل حي وصحيح
    const tickInterval = setInterval(() => forceTick((t) => t + 1), 30000);

    return () => {
      supabase.removeChannel(channel);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      clearInterval(tickInterval);
    };
  }, []);

  const minutesAgo = Math.max(0, Math.floor((Date.now() - lastSyncAt.getTime()) / 60000));

  return { state, minutesAgo };
}
