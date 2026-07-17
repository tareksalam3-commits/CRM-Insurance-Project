import { useEffect, useState } from 'react';
import type { User } from '../../../lib/supabase';
import { fetchCollectionQuickStats, type CollectionQuickStats } from '../services/collectionService';

// ===== بطاقات إحصائية سريعة (لحظية من Supabase) =====
export function useCollectionQuickStats(user: User | null | undefined) {
  const [quickStats, setQuickStats] = useState<CollectionQuickStats | null>(null);
  const [quickStatsLoading, setQuickStatsLoading] = useState(true);

  const loadQuickStats = async () => {
    setQuickStatsLoading(true);
    try {
      setQuickStats(await fetchCollectionQuickStats());
    } catch (error) {
      console.error('Error loading collection quick stats:', error);
    } finally {
      setQuickStatsLoading(false);
    }
  };

  useEffect(() => {
    if (user) loadQuickStats();
  }, [user]);

  return { quickStats, quickStatsLoading, loadQuickStats };
}
