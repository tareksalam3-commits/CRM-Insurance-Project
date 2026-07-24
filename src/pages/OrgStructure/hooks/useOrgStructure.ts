import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { useBranchContext } from '../../../lib/branchContext';
import { supabase, canViewOrgStructure, type UserRole } from '../../../lib/supabase';
import { dalRead } from '../../../lib/dataAccessLayer';
import { fetchUserSubtreeIdsBranchAware, fetchBranchRoleMap } from '../../../lib/branchHierarchy';
import { useReconnectRefetch } from '../../../hooks/useReconnectRefetch';
import type { RosterUser } from '../types';
import { monthStartStr } from '../utils';

// ─── hook: منطق تحميل وعرض الهيكل الوظيفي ──────────────────
// النظام دلوقتي "Drill-down": بتشوف مستوى واحد بس فى كل مرة (اللي أنت
// فاتحه + المرؤوسين المباشرين ليه)، وبتدخل جوه أي حد بالضغط عليه — بدل
// النظام القديم اللي كان بيفرد كل المستويات فوق بعض فى نفس الشاشة.
export function useOrgStructure() {
  const { user } = useAuth();
  const { currentBranchId } = useBranchContext();
  const canView = !!user && canViewOrgStructure(user.role);

  const [loading, setLoading]       = useState(true);
  const [roster, setRoster]         = useState<Map<string, RosterUser>>(new Map());
  const [production, setProduction] = useState<Map<string, number>>(new Map());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());

  // مسار التنقل: من الجذر (أنت) لحد الشخص اللي واقف فى صفحته دلوقتي
  const [path, setPath] = useState<string[]>([]);

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter]   = useState<UserRole | 'all'>('all');

  // ── تنزيل التشكيل (PDF) ─────────────────────────────────
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [formationPreview, setFormationPreview] = useState<{ branchName: string; asOfDate: string } | null>(null);

  const rosterRef     = useRef(roster);
  const productionRef = useRef(production);
  const loadingRef    = useRef(loadingIds);
  const branchIdRef   = useRef(currentBranchId);
  rosterRef.current     = roster;
  productionRef.current = production;
  loadingRef.current    = loadingIds;
  branchIdRef.current   = currentBranchId;

  useEffect(() => { if (user && canView) loadRoster(); }, [user, canView, currentBranchId]);

  useReconnectRefetch(() => { if (user && canView) loadRoster(); });

  const loadRoster = async () => {
    setLoading(true);
    try {
      // نطاق المستخدم (نفسه + كل من تحته) فى سياق الفرع الحالي (المرحلة 3):
      // get_user_subtree_branch_aware بتمشي فى user_branch_roles الخاصة
      // بالفرع ده بس لو currentBranchId موجود، وإلا بترجع لسلوك get_user_subtree
      // الأصلي العابر للفروع.
      const ids = await fetchUserSubtreeIdsBranchAware('orgstructure', user!.id, currentBranchId);

      const result = await dalRead(
        `orgstructure:roster:${user!.id}:${[...ids].sort().join(',')}`,
        async () => {
          const { data: usersData, error: usersError } = await supabase
            .from('users')
            .select('id, name, role, manager_id, is_active, avatar_url, target')
            .is('deleted_at', null)
            .in('id', ids);
          if (usersError) throw usersError;

          return (usersData || []).map((u: any) => ({ ...u, target: u.target || 0 })) as RosterUser[];
        },
        { emptyValue: [] as RosterUser[] },
      );

      // نطبّق "الفرع" فوق role/manager_id العامين: أي مستخدم عنده صف مطابق
      // فى user_branch_roles لنفس الفرع، بياخد role/manager_id بتوع الفرع ده
      // بدل قيمته العامة — فالهرم (childrenMap تحت) والإحصائيات والبحث كلها
      // بتشتغل على سياق الفرع تلقائيًا من غير أي تعديل تاني فى الملف ده.
      const branchRoles = await fetchBranchRoleMap(currentBranchId, ids);
      const rosterData: RosterUser[] = result.data.map((u) => {
        const br = branchRoles.get(u.id);
        return br ? { ...u, role: br.role, manager_id: br.manager_id } : u;
      });

      const map = new Map<string, RosterUser>();
      rosterData.forEach((u) => map.set(u.id, u));

      // نمسح إنتاج الفرع القديم عند إعادة تحميل الهيكل (مثلاً بعد تبديل
      // الفرع الحالي) — القيم بقت مرتبطة بالفرع (get_org_node_production_branch_aware)
      // فمينفعش نفضل مستخدمين قيمة محسوبة لفرع سابق لنفس المستخدم
      setProduction(new Map());
      productionRef.current = new Map();
      setLoadingIds(new Set());
      loadingRef.current = new Set();

      setRoster(map);
      setPath([user!.id]);
      const directChildren = Array.from(map.values())
        .filter((u) => u.manager_id === user!.id)
        .map((u) => u.id);
      await ensureProduction([user!.id, ...directChildren], map);
    } catch (err) {
      console.error('Error loading org structure:', err);
    } finally {
      setLoading(false);
    }
  };

  const childrenMap = useMemo(() => {
    const map = new Map<string, string[]>();
    roster.forEach((u) => {
      if (!u.manager_id || !roster.has(u.manager_id)) return;
      if (!map.has(u.manager_id)) map.set(u.manager_id, []);
      map.get(u.manager_id)!.push(u.id);
    });
    return map;
  }, [roster]);

  const ensureProduction = useCallback(async (ids: string[], rosterOverride?: Map<string, RosterUser>) => {
    const r = rosterOverride || rosterRef.current;
    const toFetch = ids.filter(
      (id) => r.has(id) && !productionRef.current.has(id) && !loadingRef.current.has(id)
    );
    if (toFetch.length === 0) return;

    setLoadingIds((prev) => {
      const next = new Set(prev);
      toFetch.forEach((id) => next.add(id));
      loadingRef.current = next;
      return next;
    });

    const CHUNK = 60;
    for (let i = 0; i < toFetch.length; i += CHUNK) {
      const chunk = toFetch.slice(i, i + CHUNK);
      try {
        const monthKey = monthStartStr();
        const branchId = branchIdRef.current;
        const result = await dalRead(
          `orgstructure:production:${branchId || 'default'}:${monthKey}:${[...chunk].sort().join(',')}`,
          async () => {
            const { data, error } = await supabase.rpc('get_org_node_production_branch_aware', {
              p_user_ids: chunk,
              p_month_start: monthKey,
              p_branch_id: branchId,
            });
            if (error) throw error;
            return (data || []) as { user_id: string; production: number }[];
          },
          { emptyValue: [] as { user_id: string; production: number }[] },
        );
        setProduction((prev) => {
          const next = new Map(prev);
          result.data.forEach((row) => next.set(row.user_id, Number(row.production) || 0));
          productionRef.current = next;
          return next;
        });
      } catch (err) {
        console.error('Error loading production:', err);
      } finally {
        setLoadingIds((prev) => {
          const next = new Set(prev);
          chunk.forEach((id) => next.delete(id));
          loadingRef.current = next;
          return next;
        });
      }
    }
  }, []);

  // الدخول لصفحة حد معين (يبقى هو "الحالي" وتحته مرؤوسينه المباشرين)
  const navigateInto = useCallback((id: string) => {
    setPath((prev) => [...prev, id]);
    ensureProduction(childrenMap.get(id) || []);
  }, [childrenMap, ensureProduction]);

  // الضغط على أي اسم فى شريط المسار (breadcrumb) يرجعك لمستواه مباشرة
  const navigateToIndex = useCallback((index: number) => {
    setPath((prev) => prev.slice(0, index + 1));
  }, []);

  const goBack = useCallback(() => {
    setPath((prev) => (prev.length > 1 ? prev.slice(0, -1) : prev));
  }, []);

  // نتيجة بحث اتضغطت: يتفتح مسارها كامل من الجذر لحدها هى نفسها
  const selectSearchResult = useCallback((match: RosterUser) => {
    const r = rosterRef.current;
    const chain: string[] = [];
    let cur: RosterUser | undefined = match;
    while (cur) {
      chain.unshift(cur.id);
      cur = cur.manager_id ? r.get(cur.manager_id) : undefined;
    }
    setPath(chain);
    setSearchQuery('');
    ensureProduction([...chain, ...(childrenMap.get(match.id) || [])]);
  }, [childrenMap, ensureProduction]);

  // ── البحث والفلترة ──────────────────────────────────────
  const activeFilter = searchQuery.trim().length > 0 || roleFilter !== 'all';

  const matches = useMemo(() => {
    if (!activeFilter) return null;
    let list = Array.from(roster.values());
    if (roleFilter !== 'all') list = list.filter((u) => u.role === roleFilter);
    const q = searchQuery.trim().toLowerCase();
    if (q) list = list.filter((u) => u.name.toLowerCase().includes(q));
    return list;
  }, [roster, searchQuery, roleFilter, activeFilter]);

  // ── إحصائيات سريعة (على كامل النطاق، مش بس المستوى الحالي) ─
  const stats = useMemo(() => {
    let total = 0, generalSupervisors = 0, supervisors = 0, groupLeaders = 0, agents = 0;
    roster.forEach((u) => {
      total++;
      if (u.role === 'general_supervisor') generalSupervisors++;
      else if (u.role === 'supervisor') supervisors++;
      else if (u.role === 'group_leader') groupLeaders++;
      else if (u.role === 'agent' || u.role === 'premium_agent') agents++;
    });
    return { total, generalSupervisors, supervisors, groupLeaders, agents };
  }, [roster]);

  return {
    user,
    canView,
    loading,
    roster,
    childrenMap,
    production,
    loadingIds,
    path,
    navigateInto,
    navigateToIndex,
    goBack,
    searchQuery,
    setSearchQuery,
    roleFilter,
    setRoleFilter,
    showDownloadModal,
    setShowDownloadModal,
    formationPreview,
    setFormationPreview,
    matches,
    selectSearchResult,
    stats,
  };
}
