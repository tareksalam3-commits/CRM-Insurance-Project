import { useState } from 'react';
import { ChevronDown, ChevronLeft, Users } from 'lucide-react';
import { getRoleBadgeClass } from '../../Users/business/roleHierarchy';
import type { StatsTreeNode } from '../types';

interface NodeRowProps {
  node: StatsTreeNode;
  depth: number;
  selectedId: string | null;
  onSelect: (node: StatsTreeNode) => void;
}

function NodeRow({ node, depth, selectedId, onSelect }: NodeRowProps) {
  const [expanded, setExpanded] = useState(depth === 0);
  const hasChildren = node.children.length > 0;
  const isSelected = selectedId === node.userId;

  return (
    <div>
      <button
        onClick={() => onSelect(node)}
        className={`w-full flex items-center gap-2 rounded-lg px-2 py-2 text-start transition-colors ${
          isSelected ? 'bg-primary-50 ring-1 ring-primary-200' : 'hover:bg-secondary-50'
        }`}
        style={{ paddingInlineStart: `${depth * 20 + 8}px` }}
      >
        {hasChildren ? (
          <span
            role="button"
            tabIndex={-1}
            onClick={(e) => { e.stopPropagation(); setExpanded((v) => !v); }}
            className="p-0.5 rounded hover:bg-secondary-200 shrink-0"
          >
            {expanded ? <ChevronDown className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
          </span>
        ) : (
          <span className="w-5 shrink-0" />
        )}

        <span className="font-medium text-secondary-900 truncate">{node.name}</span>
        <span className={`badge border shrink-0 ${getRoleBadgeClass(node.role)}`}>{node.roleLabel}</span>

        <span className="ms-auto flex items-center gap-3 text-xs text-secondary-500 shrink-0">
          <span>مكالمات: <b className="text-secondary-800">{node.subtree.callsActual}</b></span>
          <span>مواعيد: <b className="text-secondary-800">{node.subtree.appointmentsActual}</b></span>
          <span>عملاء جدد: <b className="text-secondary-800">{node.subtree.newClients}</b></span>
        </span>
      </button>

      {hasChildren && expanded && (
        <div>
          {node.children.map((child) => (
            <NodeRow key={child.userId} node={child} depth={depth + 1} selectedId={selectedId} onSelect={onSelect} />
          ))}
        </div>
      )}
    </div>
  );
}

interface StatsTreeViewProps {
  nodes: StatsTreeNode[];
  selectedId: string | null;
  onSelect: (node: StatsTreeNode) => void;
}

/** شجرة هرمية قابلة للطي/التوسيع لإحصائيات الفريق — كل عقدة تعرض إجمالي
 * نطاقها (هي + كل من تحتها)، والضغط عليها يختارها لعرض تفاصيلها بجانبها */
export function StatsTreeView({ nodes, selectedId, onSelect }: StatsTreeViewProps) {
  if (nodes.length === 0) {
    return (
      <div className="card text-center py-8 text-secondary-400 flex flex-col items-center gap-2">
        <Users className="w-6 h-6" />
        لا يوجد أفراد فى نطاقك حالياً
      </div>
    );
  }

  return (
    <div className="card space-y-0.5">
      {nodes.map((node) => (
        <NodeRow key={node.userId} node={node} depth={0} selectedId={selectedId} onSelect={onSelect} />
      ))}
    </div>
  );
}
