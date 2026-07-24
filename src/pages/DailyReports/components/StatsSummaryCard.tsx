import type { StatsAggregate } from '../types';
import { APPOINTMENTS_QUALITY_LABELS } from '../types';

interface StatItemProps {
  label: string;
  value: string | number;
}

function StatItem({ label, value }: StatItemProps) {
  return (
    <div className="rounded-lg bg-secondary-50 p-3 text-center">
      <div className="text-lg font-bold text-secondary-900">{value}</div>
      <div className="text-xs text-secondary-500 mt-0.5">{label}</div>
    </div>
  );
}

interface StatsSummaryCardProps {
  aggregate: StatsAggregate;
  title?: string;
}

/** بطاقة ملخص لإجمالي إحصائيات مجمّعة (فرد أو فريق) خلال فترة معيّنة */
export function StatsSummaryCard({ aggregate, title }: StatsSummaryCardProps) {
  const a = aggregate;
  const punctualityPct = a.entriesCount > 0 ? Math.round((a.punctualityOkCount / a.entriesCount) * 100) : null;

  if (a.entriesCount === 0) {
    return (
      <div className="card">
        {title && <h3 className="font-bold text-secondary-900 mb-2">{title}</h3>}
        <p className="text-sm text-secondary-400 text-center py-4">لا توجد إحصائيات مسجّلة لهذه الفترة</p>
      </div>
    );
  }

  return (
    <div className="card space-y-4">
      {title && <h3 className="font-bold text-secondary-900">{title}</h3>}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatItem label="أيام مسجّلة" value={a.entriesCount} />
        <StatItem label="الالتزام بالمواعيد والزي" value={punctualityPct !== null ? `${punctualityPct}%` : '—'} />
        <StatItem label="عملاء جدد (طلبات تأمين)" value={a.newClients} />
        <StatItem label="أيام عمل outdoor" value={a.outdoorDaysCount} />
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatItem label="إجمالي المكالمات" value={a.callsActual} />
        <StatItem label="مكالمات نتج عنها مواعيد" value={a.callsToAppointments} />
        <StatItem label="إجمالي المواعيد الفعلية" value={a.appointmentsActual} />
      </div>

      <div>
        <p className="input-label mb-1.5">جودة المواعيد بعد المراجعة</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(APPOINTMENTS_QUALITY_LABELS) as (keyof typeof APPOINTMENTS_QUALITY_LABELS)[]).map((q) => (
            <span key={q} className="badge badge-secondary">
              {APPOINTMENTS_QUALITY_LABELS[q]}: {a.appointmentsQualityCounts[q]}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
