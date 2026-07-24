import { StatsSummaryCard } from './StatsSummaryCard';
import { EntriesTable } from './EntriesTable';
import type { StatsTreeNode } from '../types';

interface NodeDetailPanelProps {
  node: StatsTreeNode;
}

export function NodeDetailPanel({ node }: NodeDetailPanelProps) {
  const isAgent = node.own !== null;

  return (
    <div className="space-y-4">
      <StatsSummaryCard
        aggregate={node.subtree}
        title={node.children.length > 0 ? `إجمالي ${node.name} وفريقه` : `إجمالي ${node.name}`}
      />

      {isAgent && (
        <div className="card">
          <h3 className="font-bold text-secondary-900 mb-3">تفاصيل الأيام المسجّلة</h3>
          <EntriesTable entries={node.ownEntries} />
        </div>
      )}
    </div>
  );
}
