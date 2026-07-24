import { useEffect, useState } from 'react';
import type { User } from '../../../lib/supabase';
import { fetchCollectionQuickStats, type CollectionQuickStats } from '../services/collectionService';
import { useReconnectRefetch } from '../../../hooks/useReconnectRefetch';

// ===== بطاقات إحصائية سريعة (لحظية من Supabase) =====
export function useCollectionQuickStats(user: User | null | undefined, branchId: string | null = null) {
  const [quickStats, setQuickStats] = useState<CollectionQuickStats | null>(null);
  const [quickStatsLoading, setQuickStatsLoading] = useState(true);

  const loadQuickStats = async () => {
    setQuickStatsLoading(true);
    try {
      setQuickStats(await fetchCollectionQuickStats(branchId));
    } catch (error) {
      console.error('Error loading collection quick stats:', error);
    } finally {
      setQuickStatsLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadQuickStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, branchId]);

  useReconnectRefetch(() => { if (user) loadQuickStats(); });

  return { quickStats, quickStatsLoading, loadQuickStats };
}
