import { useCallback, useEffect, useRef, useState } from 'react';
import { dalRead, type DalOptions, type DalStatus } from '../lib/dataAccessLayer';
import { subscribeNetwork } from '../lib/networkManager';

// ===================================
// هوك موحّد لاستهلاك DAL داخل الصفحات. الهدف: أي صفحة تستخدمه بتاخد
// نفس السلوك تلقائياً (لا Loading لانهائي، لا شاشة بيضاء، لا انهيار)
// من غير ما تكتب try/catch أو setLoading خاص بيها.
//
// ملاحظة: استخدام هذا الهوك اختياري للصفحات — لو الصفحة بتنادي دالة
// Service بترجع نتيجة معالجة بالفعل من dalRead (وهو التغيير الأساسي فى
// هذا الإصلاح)، فهي مستفيدة تلقائياً من نفس الحماية حتى بدون هذا الهوك.
// هذا الهوك مفيد للصفحات اللي عايزة كمان تعرض حالة Offline/Stale بوضوح
// فى الواجهة (مثلاً بانر "بيانات محفوظة من كذا دقيقة") بدل تجاهلها.
// ===================================

export interface UseDataQueryResult<T> {
  data: T;
  loading: boolean;
  status: DalStatus;
  isStale: boolean;
  cachedAt: number | null;
  errorMessage?: string;
  refetch: () => void;
}

export function useDataQuery<T>(
  key: string,
  fetcher: () => Promise<T>,
  options: DalOptions<T>,
  deps: unknown[] = [],
): UseDataQueryResult<T> {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<T>(options.emptyValue);
  const [status, setStatus] = useState<DalStatus>('online');
  const [isStale, setIsStale] = useState(false);
  const [cachedAt, setCachedAt] = useState<number | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | undefined>(undefined);

  // نحتفظ بأحدث نسخة من fetcher/options فى ref حتى لا نضطر لإضافتهم لمصفوفة
  // الاعتماديات (بيتغيروا كل render لأنهم دوال/كائنات جديدة)
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [tick, setTick] = useState(0);
  const refetch = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    dalRead(key, () => fetcherRef.current(), optionsRef.current).then((result) => {
      if (cancelled) return;
      setData(result.data);
      setStatus(result.status);
      setIsStale(result.isStale);
      setCachedAt(result.cachedAt);
      setErrorMessage(result.errorMessage);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, tick, ...deps]);

  // إعادة المحاولة تلقائياً عند عودة الاتصال لو آخر نتيجة كانت من كاش/فاضية
  useEffect(() => {
    const unsubscribe = subscribeNetwork((snapshot) => {
      if (snapshot.state === 'connected' && status !== 'online') {
        refetch();
      }
    });
    return unsubscribe;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  return { data, loading, status, isStale, cachedAt, errorMessage, refetch };
}
