import { DownloadFormationModal } from '../OrgFormation/DownloadFormationModal';
import { FormationPreviewModal } from '../OrgFormation/FormationPreviewModal';
import { buildOrgChart } from '../OrgFormation/orgChartBuilder';
import { useOrgStructure } from './hooks/useOrgStructure';
import { AccessDenied } from './components/AccessDenied';
import { OrgHeader } from './components/OrgHeader';
import { LoadingState } from './components/LoadingState';
import { EmptyState } from './components/EmptyState';
import { OrgStats } from './components/OrgStats';
import { OrgActions } from './components/OrgActions';
import { OrgTree } from './components/OrgTree';

export type { RosterUser } from './types';

// ─── component ────────────────────────────────────────────
export function OrgStructure() {
  const {
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
  } = useOrgStructure();

  if (!canView) {
    return <AccessDenied />;
  }

  return (
    <>
    <div className="space-y-6 animate-fadeIn">
      <OrgHeader />

      {loading ? (
        <LoadingState />
      ) : roster.size === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* إحصائيات سريعة */}
          <OrgStats stats={stats} currentUserRole={user!.role} />

          {/* أدوات البحث والفلترة */}
          <OrgActions
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            roleFilter={roleFilter}
            setRoleFilter={setRoleFilter}
            expandAll={expandAll}
            expandingAll={expandingAll}
            collapseAll={collapseAll}
            onDownloadClick={() => setShowDownloadModal(true)}
            matches={matches}
            currentUserRole={user!.role}
          />

          {/* الهيكل */}
          <OrgTree
            rootId={user!.id}
            roster={roster}
            childrenMap={childrenMap}
            expanded={expanded}
            production={production}
            loadingIds={loadingIds}
            highlightIds={highlightIds}
            onToggle={toggle}
            registerRef={registerRef}
          />
        </>
      )}
    </div>

    {showDownloadModal && (
      <DownloadFormationModal
        onClose={() => setShowDownloadModal(false)}
        onPreview={(branchName, asOfDate) => {
          setShowDownloadModal(false);
          setFormationPreview({ branchName, asOfDate });
        }}
      />
    )}

    {formationPreview && (
      <FormationPreviewModal
        heads={buildOrgChart(user!.id, roster, childrenMap)}
        branchName={formationPreview.branchName}
        asOfDate={formationPreview.asOfDate}
        onClose={() => setFormationPreview(null)}
      />
    )}
    </>
  );
}
