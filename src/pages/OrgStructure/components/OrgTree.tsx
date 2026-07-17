import type { RosterUser } from '../types';
import { OrgNode } from './OrgNode';

// ─── الهيكل ──────────────────────────────────────────────
export function OrgTree({
  rootId, roster, childrenMap, expanded, production, loadingIds, highlightIds, onToggle, registerRef,
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
}) {
  return (
    <div className="card">
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
  );
}
