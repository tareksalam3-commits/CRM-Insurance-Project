import { Network } from 'lucide-react';
import type { RosterUser } from '../types';
import type { UserRole } from '../../../lib/supabase';
import { OrgChildRow } from './OrgChildRow';
import { OrgLegend } from './OrgLegend';

export function OrgChildrenList({
  childIds,
  roster,
  childrenMap,
  production,
  loadingIds,
  currentUserRole,
  onOpen,
}: {
  childIds: string[];
  roster: Map<string, RosterUser>;
  childrenMap: Map<string, string[]>;
  production: Map<string, number>;
  loadingIds: Set<string>;
  currentUserRole: UserRole;
  onOpen: (id: string) => void;
}) {
  if (childIds.length === 0) {
    return (
      <div className="card text-center py-8">
        <Network className="w-10 h-10 text-secondary-300 mx-auto mb-2" />
        <p className="text-secondary-500 text-sm">مفيش مرؤوسين مباشرين لهذا الشخص</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <OrgLegend roster={roster} currentUserRole={currentUserRole} />
      <div className="space-y-1.5">
        {childIds.map((id) => {
          const node = roster.get(id);
          if (!node) return null;
          const kids = childrenMap.get(id) || [];
          const activeKidsCount = kids.filter((cid) => roster.get(cid)?.is_active !== false).length;
          return (
            <OrgChildRow
              key={id}
              node={node}
              hasChildren={kids.length > 0}
              childCount={activeKidsCount}
              production={production.get(id)}
              isLoadingProd={loadingIds.has(id)}
              onOpen={() => onOpen(id)}
            />
          );
        })}
      </div>
    </div>
  );
}
