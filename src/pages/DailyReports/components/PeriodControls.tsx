import type { StatsPeriodType } from '../utils';
import { PERIOD_TYPE_LABELS, formatDateInput, parseDateInput } from '../utils';

interface PeriodControlsProps {
  periodType: StatsPeriodType;
  onPeriodTypeChange: (type: StatsPeriodType) => void;
  start: Date;
  end: Date;
  onRangeChange: (start: Date, end: Date) => void;
}

/** تحكم فترة عرض الإحصائيات: اختيار نوع الفترة (يوم/أسبوع/شهر/ربع سنة)
 * بالإضافة لنطاق تاريخ "من" و"إلى" حر تماماً */
export function PeriodControls({ periodType, onPeriodTypeChange, start, end, onRangeChange }: PeriodControlsProps) {
  return (
    <div className="card space-y-2">
      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <label className="input-label">نوع الفترة</label>
          <select
            className="input-field"
            value={periodType}
            onChange={(e) => onPeriodTypeChange(e.target.value as StatsPeriodType)}
          >
            {(Object.keys(PERIOD_TYPE_LABELS) as StatsPeriodType[]).map((t) => (
              <option key={t} value={t}>{PERIOD_TYPE_LABELS[t]}</option>
            ))}
          </select>
        </div>

        <div className="space-y-1">
          <label className="input-label">من</label>
          <input
            type="date"
            className="input-field"
            value={formatDateInput(start)}
            max={formatDateInput(end)}
            onChange={(e) => {
              if (!e.target.value) return;
              onRangeChange(parseDateInput(e.target.value), end);
            }}
          />
        </div>

        <div className="space-y-1">
          <label className="input-label">إلى</label>
          <input
            type="date"
            className="input-field"
            value={formatDateInput(end)}
            min={formatDateInput(start)}
            max={formatDateInput(new Date())}
            onChange={(e) => {
              if (!e.target.value) return;
              onRangeChange(start, parseDateInput(e.target.value));
            }}
          />
        </div>
      </div>
    </div>
  );
}
