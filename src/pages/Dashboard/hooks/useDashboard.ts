import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { type UserRole } from '../../../lib/supabase';
import { format, startOfMonth, endOfMonth } from 'date-fns';

import type { DashboardStats, TeamPerformance, TeamMemberDetail } from '../types';
import {
  fetchUserSubtreeIds, fetchDashboardRawData, fetchTeamUsers,
} from '../services/dashboardService';
import { computeDashboardStats, computeTeamPerformance, computeChartData, computeTeamAchievementDetails } from '../business/dashboardCalculator';
import type { CancellationSummary } from '../../Cancellations/types';
import { loadCancellationSummary } from '../../Cancellations/services/cancellationService';
import { TEAM_PERFORMANCE_SECTIONS } from '../constants';

export function useDashboard() {
  const { user } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [teamPerformance, setTeamPerformance] = useState<TeamPerformance[]>([]);
  const [loading, setLoading] = useState(true);
  const [chartData, setChartData] = useState<{ production: number; collection: number }>({ production: 0, collection: 0 });
  // مؤشر "نسبة الإلغاءات" — يُحمَّل بشكل مستقل تماماً ولا يؤثر على أي حساب آخر في الصفحة
  const [cancellationSummary, setCancellationSummary] = useState<CancellationSummary | null>(null);

  // البيانات الخام المستخدمة أصلاً لحساب "أداء الفريق" (بالأعلى) — يتم
  // الاحتفاظ بها هنا فقط لإعادة استخدامها فى حساب تفاصيل الـ Bottom Sheet
  // التفاعلي عند الضغط على اسم، بدون أي استعلامات إضافية للشبكة (نفس
  // البيانات المحمَّلة أصلاً مع لوحة التحكم لكل الفريق المرئي للمستخدم).
  const [teamUsersRaw, setTeamUsersRaw] = useState<{ id: string; name: string; role: string; target: number | null; manager_id: string | null; is_active: boolean }[]>([]);
  const [teamPaymentsRaw, setTeamPaymentsRaw] = useState<any[]>([]);
  // سلسلة التنقل الهرمي داخل الـ Sheet (من الجذر إلى الشخص المعروض حاليًا)؛
  // فارغة = الـ Sheet مغلق
  const [sheetStack, setSheetStack] = useState<TeamMemberDetail[]>([]);

  useEffect(() => {
    if (user) {
      loadDashboardData();
      loadCancellationStats();
    }
  }, [user]);

  // تحميل مستقل لمؤشر "نسبة الإلغاءات" — منفصل تماماً عن loadDashboardData
  // وعن كل الحسابات الأخرى في الصفحة، فشله لا يؤثر على باقي الإحصائيات
  const loadCancellationStats = async () => {
    if (!user) return;
    try {
      const result = await loadCancellationSummary({ id: user.id, name: user.name, role: user.role });
      setCancellationSummary(result);
    } catch (error) {
      console.error('Error loading cancellation stats:', error);
    }
  };

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      const monthStartStr = format(monthStart, 'yyyy-MM-dd');

      const userIds = await fetchUserSubtreeIds(user!.id);

      // fetchDashboardRawData وfetchTeamUsers مستقلان تمامًا عن بعضهما (كلاهما
      // يعتمد فقط على userIds بالفعل)، فبيتنفذوا بالتوازي بدل التسلسل — نفس
      // النتائج بالظبط لكن بزمن أقل. كذلك paymentsRes القادمة من
      // fetchDashboardRawData تحتوي أصلاً على كل الحقول التي كانت تُجلب سابقًا
      // مرتين إضافيتين (fetchMonthPayments وfetchMonthPaymentsWithFirstFlag)
      // لحساب أداء الفريق والرسم البياني — تمت إزالة هذين الاستعلامين
      // المكررين والاستغناء عنهما بنفس البيانات المحمّلة أصلاً.
      const [{ customersRes, policiesRes, installmentsRes, paymentsRes }, teamUsers] =
        await Promise.all([
          fetchDashboardRawData(userIds, monthStartStr),
          fetchTeamUsers(userIds),
        ]);

      const policies = policiesRes.data || [];
      const payments = paymentsRes.data || [];

      setStats(computeDashboardStats({
        customersCount: customersRes.count || 0,
        policies,
        installmentsRaw: installmentsRes.data || [],
        paymentsRaw: payments,
        userIds,
        monthStart,
        monthEnd,
        target: user?.target || 0,
      }));

      if (teamUsers.length > 0) {
        setTeamUsersRaw(teamUsers);
        setTeamPaymentsRaw(payments);
        setTeamPerformance(computeTeamPerformance(teamUsers, payments, user?.role as UserRole | undefined));
      }

      setChartData(computeChartData(payments, userIds));
    } catch (error) {
      console.error('Error loading dashboard:', error);
    } finally {
      setLoading(false);
    }
  };

  const policyStatusData = stats
    ? [
        { name: 'نشط', value: stats.activePolicies, color: '#22c55e' },
        { name: 'ملغى', value: stats.cancelledPolicies, color: '#ef4444' }
      ]
    : [];

  const teamPerformanceSections = TEAM_PERFORMANCE_SECTIONS
    .map((section) => ({
      label: section.label,
      members: teamPerformance.filter((m) => section.roles.includes(m.role)).slice(0, 5),
    }))
    .filter((section) => section.members.length > 0);

  // تفاصيل أداء كل عضو (مقسّمة إنتاج جديد / تحصيل) لكل الفريق المرئي —
  // تُحسب مرة واحدة فقط من نفس البيانات المحمّلة أصلاً بالأعلى (بدون أي
  // استعلام إضافي)، وتُستخدم لتغذية الـ Bottom Sheet التفاعلي عند الضغط على
  // أي اسم، بما فى ذلك التنقل الهرمي بين المستويات داخل نفس الجلسة.
  const achievementDetails = useMemo(
    () => computeTeamAchievementDetails(teamUsersRaw, teamPaymentsRaw),
    [teamUsersRaw, teamPaymentsRaw]
  );

  const childrenByManager = useMemo(() => {
    const map = new Map<string, string[]>();
    teamUsersRaw.forEach((u) => {
      if (!u.manager_id) return;
      const list = map.get(u.manager_id) || [];
      list.push(u.id);
      map.set(u.manager_id, list);
    });
    return map;
  }, [teamUsersRaw]);

  const getChildrenDetails = (personId: string): TeamMemberDetail[] => {
    const childIds = childrenByManager.get(personId) || [];
    return childIds
      .map((id) => achievementDetails.get(id))
      .filter((d): d is TeamMemberDetail => !!d)
      .sort((a, b) => b.achieved - a.achieved);
  };

  const openTeamMemberSheet = (personId: string) => {
    const detail = achievementDetails.get(personId);
    if (detail) setSheetStack([detail]);
  };

  const handleSelectChild = (child: TeamMemberDetail) => {
    setSheetStack((prev) => [...prev, child]);
  };

  const handleSheetBack = () => {
    setSheetStack((prev) => prev.slice(0, -1));
  };

  const handleSheetClose = () => setSheetStack([]);

  return {
    user,
    stats,
    loading,
    chartData,
    cancellationSummary,
    policyStatusData,
    teamPerformanceSections,
    achievementDetails,
    sheetStack,
    getChildrenDetails,
    openTeamMemberSheet,
    handleSelectChild,
    handleSheetBack,
    handleSheetClose,
  };
}
