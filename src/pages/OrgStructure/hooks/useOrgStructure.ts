import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { supabase, canViewOrgStructure, type UserRole } from '../../../lib/supabase';
import { dalRead } from '../../../lib/dataAccessLayer';
import type { RosterUser } from '../types';
import { monthStartStr } from '../utils';

// ─── hook: كل منطق تحميل وعرض الهيكل الوظيفي ───────────────
export function useOrgStructure() {
  const { user } = useAuth();
  const canView = !!user && canViewOrgStructure(user.role);

  const [loading, setLoading]       = useState(true);
  const [roster, setRoster]         = useState<Map<string, RosterUser>>(new Map());
  const [expanded, setExpanded]     = useState<Set<string>>(new Set());
  const [production, setProduction] = useState<Map<string, number>>(new Map());
  const [loadingIds, setLoadingIds] = useState<Set<string>>(new Set());
  const [expandingAll, setExpandingAll] = useState(false);

  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter]   = useState<UserRole | 'all'>('all');

  // ── تنزيل التشكيل (PDF) ─────────────────────────────────
  const [showDownloadModal, setShowDownloadModal] = useState(false);
  const [formationPreview, setFormationPreview] = useState<{ branchName: string; asOfDate: string } | null>(null);

  // مراجع حية للحالة، عشان دالة ensureProduction تقرأ آخر نسخة دايماً
  // من غير ما تحتاج تتكرر كـ dependency في كل الأماكن
  const rosterRef     = useRef(roster);
  const productionRef = useRef(production);
  const loadingRef    = useRef(loadingIds);
  rosterRef.current     = roster;
  productionRef.current = production;
  loadingRef.current    = loadingIds;

  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => { if (user && canView) loadRoster(); }, [user]);

  const loadRoster = async () => {
    setLoading(true);
    try {
      // كل القراءة (تحديد الفريق + بيانات الأعضاء الخفيفة) بتمر من DAL دلوقتي:
      // لو مفيش إنترنت أو حصل فشل شبكة بترجع آخر نسخة محفوظة بدل ما تفضل
      // الشاشة فاضية أو معلقة (نفس المنطق المستخدم فى باقي الصفحات).
      const result = await dalRead(
        `orgstructure:roster:${user!.id}`,
        async () => {
          // 1. كل من تحت المستخدم الحالي (نفس منطق الصلاحيات القديم بالظبط)
          const { data: subtreeIds, error: subtreeError } = await supabase.rpc('get_user_subtree', { user_id: user!.id });
          if (subtreeError) throw subtreeError;
          const ids: string[] = subtreeIds || [user!.id];

          // 2. بيانات خفيفة فقط (بدون أي أرقام مالية) لكل الفريق دفعة واحدة —
          // ده اللي بيسمح بالبحث والإحصائيات الفورية من غير ما نحمّل الإنتاج كله
          const { data: usersData, error: usersError } = await supabase
            .from('users')
            .select('id, name, role, manager_id, is_active, avatar_url, target')
            .is('deleted_at', null) // استبعاد المستخدمين المحذوفين (Soft Delete) من الهيكل الوظيفي
            .in('id', ids);
          if (usersError) throw usersError;

          return (usersData || []).map((u: any) => ({ ...u, target: u.target || 0 })) as RosterUser[];
        },
        { emptyValue: [] as RosterUser[] },
      );

      const map = new Map<string, RosterUser>();
      result.data.forEach((u) => map.set(u.id, u));

      setRoster(map);
      setExpanded(new Set()); // البداية: بطاقة أعلى مستوى فقط، مغلقة
      await ensureProduction([user!.id], map);
    } catch (err) {
      console.error('Error loading org structure:', err);
    } finally {
      setLoading(false);
    }
  };

  // خريطة (مدير → مرؤوسيه المباشرين) — مبنية مرة واحدة من القائمة الخفيفة
  const childrenMap = useMemo(() => {
    const map = new Map<string, string[]>();
    roster.forEach((u) => {
      if (!u.manager_id || !roster.has(u.manager_id)) return;
      if (!map.has(u.manager_id)) map.set(u.manager_id, []);
      map.get(u.manager_id)!.push(u.id);
    });
    return map;
  }, [roster]);

  // Lazy Loading: بيجيب "الإنتاج الحالي" (مجموع تراكمي) لمجموعة مستخدمين بس،
  // وقت ما بطاقاتهم بتتفتح فعلياً — بدل ما يتحسب لكل موظفي الشركة من البداية
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
        const result = await dalRead(
          `orgstructure:production:${monthKey}:${[...chunk].sort().join(',')}`,
          async () => {
            const { data, error } = await supabase.rpc('get_org_node_production', {
              p_user_ids: chunk,
              p_month_start: monthKey
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

  const collectDescendants = (id: string, acc: Set<string>) => {
    (childrenMap.get(id) || []).forEach((childId) => {
      acc.add(childId);
      collectDescendants(childId, acc);
    });
  };

  const toggle = useCallback((id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        // إغلاق البطاقة: إخفاء كل المستويات التابعة لها كمان (مش بس المباشرين)
        next.delete(id);
        const toRemove = new Set<string>();
        collectDescendants(id, toRemove);
        toRemove.forEach((rid) => next.delete(rid));
      } else {
        next.add(id);
        ensureProduction(childrenMap.get(id) || []);
      }
      return next;
    });
  }, [childrenMap, ensureProduction]);

  const expandAll = useCallback(async () => {
    const allIds = Array.from(roster.keys());
    setExpanded(new Set(allIds));
    setExpandingAll(true);
    await ensureProduction(allIds);
    setExpandingAll(false);
  }, [roster, ensureProduction]);

  const collapseAll = useCallback(() => setExpanded(new Set()), []);

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

  // مسار كل نتيجة من الجذر لحد مكانها — عشان نفتحه تلقائياً ونمّيزه
  const highlightIds = useMemo(() => {
    if (!matches) return null;
    const set = new Set<string>();
    matches.forEach((m) => {
      let cur: RosterUser | undefined = m;
      while (cur) {
        set.add(cur.id);
        cur = cur.manager_id ? roster.get(cur.manager_id) : undefined;
      }
    });
    return set;
  }, [matches, roster]);

  useEffect(() => {
    if (!highlightIds || highlightIds.size === 0) return;
    setExpanded((prev) => {
      const next = new Set(prev);
      highlightIds.forEach((id) => next.add(id));
      return next;
    });
    ensureProduction(Array.from(highlightIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [highlightIds]);

  useEffect(() => {
    if (searchQuery.trim() && matches && matches.length === 1) {
      const el = cardRefs.current.get(matches[0].id);
      if (el) setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'center' }), 250);
    }
  }, [matches, searchQuery]);

  // ── إحصائيات سريعة ──────────────────────────────────────
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

  const registerRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(id, el);
    else cardRefs.current.delete(id);
  }, []);

  return {
    user,
    canView,
    loading,
    roster,
    expanded,
    production,
    loadingIds,
    expandingAll,
    searchQuery,
    setSearchQuery,
    roleFilter,
    setRoleFilter,
    showDownloadModal,
    setShowDownloadModal,
    formationPreview,
    setFormationPreview,
    childrenMap,
    toggle,
    expandAll,
    collapseAll,
    matches,
    highlightIds,
    stats,
    registerRef,
  };
}
