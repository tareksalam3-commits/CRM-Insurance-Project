import { useEffect, useState, useCallback } from 'react';
import { Loader2 } from 'lucide-react';

import { PeriodControls } from './PeriodControls';
import { StatsSummaryCard } from './StatsSummaryCard';
import { EntriesTable } from './EntriesTable';
import { fetchAgentOwnEntries, aggregateEntries } from '../services/dailyStatsService';
import { defaultPeriodTypeForRole, defaultRangeForPeriodType, formatDateInput, periodRangeLabel } from '../utils';
import type { StatsPeriodType } from '../utils';
import type { DailyAgentStatRow } from '../types';

interface AgentOwnStatsViewProps {
  agentId: string;
  roleLevel: number;
}

export function AgentOwnStatsView({ agentId, roleLevel }: AgentOwnStatsViewProps) {
  const [periodType, setPeriodType] = useState<StatsPeriodType>(() => defaultPeriodTypeForRole(roleLevel));
  const [range, setRange] = useState(() => defaultRangeForPeriodType(defaultPeriodTypeForRole(roleLevel)));
  const [entries, setEntries] = useState<DailyAgentStatRow[]>([]);
  const [loading, setLoading] = useState(true);

  const startStr = formatDateInput(range.start);
  const endStr = formatDateInput(range.end);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAgentOwnEntries(agentId, startStr, endStr);
      setEntries(data);
    } finally {
      setLoading(false);
    }
  }, [agentId, startStr, endStr]);

  useEffect(() => { void load(); }, [load]);

  function handlePeriodTypeChange(type: StatsPeriodType) {
    setPeriodType(type);
    setRange(defaultRangeForPeriodType(type));
  }

  return (
    <div className="space-y-4">
      <PeriodControls
        periodType={periodType}
        onPeriodTypeChange={handlePeriodTypeChange}
        start={range.start}
        end={range.end}
        onRangeChange={(start, end) => setRange({ start, end })}
      />

      <p className="text-sm text-secondary-500">{periodRangeLabel(periodType, range.start, range.end)}</p>

      {loading ? (
        <div className="card text-center py-8 text-secondary-400">
          <Loader2 className="w-5 h-5 animate-spin inline-block ms-2" /> جارِ التحميل...
        </div>
      ) : (
        <>
          <StatsSummaryCard aggregate={aggregateEntries(entries)} title="إحصائياتي" />
          <div className="card">
            <h3 className="font-bold text-secondary-900 mb-3">تفاصيل الأيام المسجّلة</h3>
            <EntriesTable entries={entries} />
          </div>
        </>
      )}
    </div>
  );
}
