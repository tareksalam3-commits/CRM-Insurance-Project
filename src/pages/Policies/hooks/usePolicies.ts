import { useEffect, useState } from 'react';
import type { Policy, User } from '../../../lib/supabase';
import {
  fetchPoliciesPage, computeDeletablePolicyIds, fetchPolicyStats, type PolicyStats,
} from '../services/policiesService';
import { useReconnectRefetch } from '../../../hooks/useReconnectRefetch';

// تحميل بيانات صفحة الوثائق: القائمة (بحث/فلاتر/صفحات)، الإحصائيات، والوثائق
// القابلة للحذف — نفس المنطق المنقول بالضبط من index.tsx الأصلي.
export function usePolicies(
  user: User | null | undefined,
  page: number,
  searchQuery: string,
  statusFilter: string,
  typeFilter: string,
  monthFilter: string,
  branchId: string | null = null,
) {
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  // أول تحميل فقط (لسه مفيش أي بيانات) يستحق Skeleton كامل — أي تحديث
  // لاحق (فلتر/صفحة/بحث) يحافظ على البيانات الحالية ظاهرة بدل الرعشة
  const isInitialLoading = loading && policies.length === 0;
  const [totalCount, setTotalCount] = useState(0);

  const [stats, setStats] = useState<PolicyStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [totalPages, setTotalPages] = useState(1);
  const [deletableIds, setDeletableIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) {
      loadPolicies();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, page, searchQuery, statusFilter, typeFilter, monthFilter, branchId]);

  useEffect(() => {
    if (user) {
      loadStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, branchId]);

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      setStats(await fetchPolicyStats(branchId));
    } catch (error) {
      console.error('Error loading policy stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const checkDeletablePolicies = async (policyList: Policy[]) => {
    try {
      setDeletableIds(await computeDeletablePolicyIds(policyList));
    } catch (error) {
      console.error('Error checking deletable policies:', error);
      setDeletableIds(new Set());
    }
  };

  const loadPolicies = async () => {
    setLoading(true);
    try {
      const { policies: pagePolicies, totalPages: pages, totalCount: count } = await fetchPoliciesPage({
        page, searchQuery, statusFilter, typeFilter, monthFilter, branchId
      });

      setPolicies(pagePolicies);
      setTotalPages(pages);
      setTotalCount(count);

      await checkDeletablePolicies(pagePolicies || []);
    } catch (error) {
      console.error('Error loading policies:', error);
    } finally {
      setLoading(false);
    }
  };

  useReconnectRefetch(
    () => { if (user) loadPolicies(); },
    () => { if (user) loadStats(); },
  );

  return {
    policies,
    loading,
    isInitialLoading,
    totalCount,
    stats,
    statsLoading,
    totalPages,
    deletableIds,
    loadPolicies,
    loadStats,
  };
}
