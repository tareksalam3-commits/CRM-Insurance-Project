import { useEffect, useState, useCallback } from 'react';
import { Loader2, Printer } from 'lucide-react';

import { useBranchContext } from '../../../lib/branchContext';
import { printWithTitle } from '../../../lib/printWithTitle';
import { PeriodControls } from './PeriodControls';
import { StatsSummaryCard } from './StatsSummaryCard';
import { StatsTreeView } from './StatsTreeView';
import { NodeDetailPanel } from './NodeDetailPanel';
import { PrintTeamStats, flattenStatsTree } from './PrintTeamStats';
import { fetchStatsTree, mergeAggregates } from '../services/dailyStatsService';
import { defaultPeriodTypeForRole, defaultRangeForPeriodType, formatDateInput, periodRangeLabel } from '../utils';
import type { StatsPeriodType } from '../utils';
import type { StatsTreeNode } from '../types';
import { EMPTY_STATS_AGGREGATE } from '../types';

interface TeamStatsViewProps {
  userId: string;
  viewerName: string;
  viewerRoleLabel: string;
  roleLevel: number;
  branchId: string | null;
}

/** يجد عقدة بمعرّف معيّن داخل شجرة (بحث بالعمق) — تُستخدم لإعادة اختيار
 * نفس العقدة المختارة بعد إعادة تحميل الشجرة (تغيير الفترة مثلاً) */
function findNode(nodes: StatsTreeNode[], userId: string): StatsTreeNode | null {
  for (const n of nodes) {
    if (n.userId === userId) return n;
    const found = findNode(n.children, userId);
    if (found) return found;
  }
  return null;
}

export function TeamStatsView({ userId, viewerName, viewerRoleLabel, roleLevel, branchId }: TeamStatsViewProps) {
  const { branches } = useBranchContext();
  const [periodType, setPeriodType] = useState<StatsPeriodType>(() => defaultPeriodTypeForRole(roleLevel));
  const [range, setRange] = useState(() => defaultRangeForPeriodType(defaultPeriodTypeForRole(roleLevel)));
  const [tree, setTree] = useState<StatsTreeNode[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const startStr = formatDateInput(range.start);
  const endStr = formatDateInput(range.end);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchStatsTree(userId, startStr, endStr, branchId);
      setTree(data);
    } finally {
      setLoading(false);
    }
  }, [userId, startStr, endStr, branchId]);

  useEffect(() => { void load(); }, [load]);

  function handlePeriodTypeChange(type: StatsPeriodType) {
    setPeriodType(type);
    setRange(defaultRangeForPeriodType(type));
  }

  const selectedNode = selectedId ? findNode(tree, selectedId) : null;
  const overallAggregate = tree.length > 0 ? mergeAggregates(tree.map((n) => n.subtree)) : EMPTY_STATS_AGGREGATE;
  const branchName = branchId ? (branches.find((b) => b.branchId === branchId)?.branchName ?? null) : null;
  const periodLabel = periodRangeLabel(periodType, range.start, range.end);

  function handlePrint() {
    setTimeout(() => printWithTitle(`تقرير-إحصائيات-يومية-${formatDateInput(range.start)}-${formatDateInput(range.end)}`), 50);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <PeriodControls
          periodType={periodType}
          onPeriodTypeChange={handlePeriodTypeChange}
          start={range.start}
          end={range.end}
          onRangeChange={(start, end) => setRange({ start, end })}
        />
        <button onClick={handlePrint} disabled={loading || tree.length === 0} className="btn btn-outline print:hidden">
          <Printer className="w-4 h-4" /> طباعة التقرير
        </button>
      </div>

      <p className="text-sm text-secondary-500 print:hidden">{periodLabel}</p>

      {loading ? (
        <div className="card text-center py-8 text-secondary-400 print:hidden">
          <Loader2 className="w-5 h-5 animate-spin inline-block ms-2" /> جارِ التحميل...
        </div>
      ) : (
        <>
          <div className="print:hidden space-y-4">
            <StatsSummaryCard aggregate={overallAggregate} title="الإجمالي الكلي" />

            <div className="grid lg:grid-cols-2 gap-4 items-start">
              <StatsTreeView nodes={tree} selectedId={selectedId} onSelect={(n) => setSelectedId(n.userId)} />
              {selectedNode ? (
                <NodeDetailPanel node={selectedNode} />
              ) : (
                <div className="card text-center py-8 text-secondary-400">
                  اختر فرداً أو مجموعة من القائمة لعرض تفاصيلها
                </div>
              )}
            </div>
          </div>

          <PrintTeamStats
            viewerName={viewerName}
            viewerRoleLabel={viewerRoleLabel}
            branchName={branchName}
            periodLabel={periodLabel}
            overallAggregate={overallAggregate}
            rows={flattenStatsTree(tree)}
          />
        </>
      )}
    </div>
  );
}
