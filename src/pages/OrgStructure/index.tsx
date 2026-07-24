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
import { OrgBreadcrumb } from './components/OrgBreadcrumb';
import { OrgCurrentCard } from './components/OrgCurrentCard';
import { OrgChildrenList } from './components/OrgChildrenList';
import { OrgSearchResults } from './components/OrgSearchResults';

export type { RosterUser } from './types';

// ─── component ────────────────────────────────────────────
export function OrgStructure() {
  const {
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
  } = useOrgStructure();

  if (!canView) {
    return <AccessDenied />;
  }

  const currentId = path[path.length - 1];
  const currentNode = currentId ? roster.get(currentId) : undefined;
  const isSearching = matches !== null;

  return (
    <>
    <div className="space-y-4 animate-fadeIn">
      <OrgHeader />

      {loading ? (
        <LoadingState />
      ) : roster.size === 0 ? (
        <EmptyState />
      ) : (
        <>
          <OrgStats stats={stats} currentUserRole={user!.role} />

          <OrgActions
            searchQuery={searchQuery}
            setSearchQuery={setSearchQuery}
            roleFilter={roleFilter}
            setRoleFilter={setRoleFilter}
            onDownloadClick={() => setShowDownloadModal(true)}
            currentUserRole={user!.role}
          />

          {isSearching ? (
            <OrgSearchResults matches={matches!} roster={roster} onSelect={selectSearchResult} />
          ) : currentNode ? (
            <div className="space-y-3">
              <OrgBreadcrumb path={path} roster={roster} onNavigate={navigateToIndex} onBack={goBack} />
              <OrgCurrentCard
                node={currentNode}
                directChildrenCount={(childrenMap.get(currentId) || []).filter((cid) => roster.get(cid)?.is_active !== false).length}
                production={production.get(currentId)}
                isLoadingProd={loadingIds.has(currentId)}
              />
              <OrgChildrenList
                childIds={(childrenMap.get(currentId) || []).filter((cid) => {
                  const c = roster.get(cid);
                  if (!c) return true;
                  const isAgentRole = c.role === 'agent' || c.role === 'premium_agent';
                  return !(isAgentRole && !c.is_active);
                })}
                roster={roster}
                childrenMap={childrenMap}
                production={production}
                loadingIds={loadingIds}
                currentUserRole={user!.role}
                onOpen={navigateInto}
              />
            </div>
          ) : null}
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
