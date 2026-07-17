import { useDashboard } from './hooks/useDashboard';
import { DashboardLoading } from './components/DashboardLoading';
import { DashboardHeader } from './components/DashboardHeader';
import { DashboardEmptyState } from './components/DashboardEmptyState';
import { DashboardStats } from './components/DashboardStats';
import { DashboardTargets } from './components/DashboardTargets';
import { DashboardPerformance } from './components/DashboardPerformance';
import { DashboardKPIs } from './components/DashboardKPIs';
import { DashboardCharts } from './components/DashboardCharts';

export function Dashboard() {
  const {
    user,
    stats,
    loading,
    chartData,
    cancellationSummary,
    policyStatusData,
    teamPerformanceSections,
    sheetStack,
    getChildrenDetails,
    openTeamMemberSheet,
    handleSelectChild,
    handleSheetBack,
    handleSheetClose,
  } = useDashboard();

  if (loading) {
    return <DashboardLoading />;
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <DashboardHeader user={user} />

      {stats && stats.totalPolicies === 0 && stats.totalCustomers === 0 && (
        <DashboardEmptyState />
      )}

      <DashboardStats stats={stats} />

      <DashboardTargets stats={stats} />

      <DashboardPerformance
        teamPerformanceSections={teamPerformanceSections}
        sheetStack={sheetStack}
        getChildrenDetails={getChildrenDetails}
        openTeamMemberSheet={openTeamMemberSheet}
        handleSelectChild={handleSelectChild}
        handleSheetBack={handleSheetBack}
        handleSheetClose={handleSheetClose}
      />

      <DashboardKPIs stats={stats} cancellationSummary={cancellationSummary} />

      <DashboardCharts
        totalPolicies={stats?.totalPolicies || 0}
        policyStatusData={policyStatusData}
        chartData={chartData}
      />
    </div>
  );
}
