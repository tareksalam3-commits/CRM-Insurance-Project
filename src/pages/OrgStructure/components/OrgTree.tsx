import type { RosterUser } from '../types';
import type { UserRole } from '../../../lib/supabase';
import { OrgNode } from './OrgNode';
import { OrgLegend } from './OrgLegend';

// ─── الهيكل ──────────────────────────────────────────────
export function OrgTree({
  rootId, roster, childrenMap, expanded, production, loadingIds, highlightIds, onToggle, registerRef, currentUserRole,
}: {
  rootId: string;
  roster: Map<string, RosterUser>;
  childrenMap: Map<string, string[]>;
  expanded: Set<string>;
  production: Map<string, number>;
  loadingIds: Set<string>;
  highlightIds: Set<string> | null;
  onToggle: (id: string) => void;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
  currentUserRole: UserRole;
}) {
  return (
    <div className="space-y-2">
      <OrgLegend roster={roster} currentUserRole={currentUserRole} />
      <div className="card overflow-x-hidden">
        <OrgNode
          id={rootId}
          depth={0}
          roster={roster}
          childrenMap={childrenMap}
          expanded={expanded}
          production={production}
          loadingIds={loadingIds}
          highlightIds={highlightIds}
          onToggle={onToggle}
          registerRef={registerRef}
        />
      </div>
    </div>
  );
}
