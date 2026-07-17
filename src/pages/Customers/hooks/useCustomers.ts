import { useEffect, useState } from 'react';
import type { User } from '../../../lib/supabase';
import {
  fetchAgentsForCurrentUser, fetchCustomersPage, computeDeletableCustomerIds,
  fetchCustomerStats, type CustomerStats,
} from '../services/customersService';
import type { CustomerWithRelations } from '../types';

// تحميل بيانات صفحة العملاء: القائمة (بحث/فلاتر/صفحات)، الوكلاء، الإحصائيات،
// والعملاء القابلين للحذف — نفس المنطق المنقول بالضبط من index.tsx الأصلي.
export function useCustomers(
  user: User | null | undefined,
  page: number,
  searchQuery: string,
  statusFilter: string,
  agentFilter: string,
  monthFilter: string,
) {
  const [customers, setCustomers] = useState<CustomerWithRelations[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  // أول تحميل فقط (لسه مفيش أي بيانات) يستحق Skeleton كامل — أي تحديث
  // لاحق (فلتر/صفحة/بحث) يحافظ على البيانات الحالية ظاهرة بدل الرعشة
  const isInitialLoading = loading && customers.length === 0;
  const [totalCount, setTotalCount] = useState(0);

  const [stats, setStats] = useState<CustomerStats | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [totalPages, setTotalPages] = useState(1);

  const [deletableIds, setDeletableIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (user) {
      loadCustomers();
      loadAgents();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, page, searchQuery, statusFilter, agentFilter, monthFilter]);

  useEffect(() => {
    if (user) {
      loadStats();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const loadAgents = async () => {
    if (!user) return;
    try {
      setAgents(await fetchAgentsForCurrentUser(user));
    } catch (error) {
      console.error('Error loading agents:', error);
    }
  };

  const loadStats = async () => {
    setStatsLoading(true);
    try {
      setStats(await fetchCustomerStats());
    } catch (error) {
      console.error('Error loading customer stats:', error);
    } finally {
      setStatsLoading(false);
    }
  };

  const checkDeletableCustomers = async (customerList: CustomerWithRelations[]) => {
    try {
      setDeletableIds(await computeDeletableCustomerIds(customerList));
    } catch (error) {
      console.error('Error checking deletable customers:', error);
      setDeletableIds(new Set());
    }
  };

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const { customers: pageCustomers, totalPages: pages, totalCount: count } = await fetchCustomersPage({
        page, searchQuery, statusFilter, agentFilter, monthFilter
      });

      setCustomers(pageCustomers);
      setTotalPages(pages);
      setTotalCount(count);

      await checkDeletableCustomers(pageCustomers || []);
    } catch (error) {
      console.error('Error loading customers:', error);
    } finally {
      setLoading(false);
    }
  };

  return {
    customers,
    agents,
    loading,
    isInitialLoading,
    totalCount,
    stats,
    statsLoading,
    totalPages,
    deletableIds,
    loadCustomers,
    loadStats,
  };
}
