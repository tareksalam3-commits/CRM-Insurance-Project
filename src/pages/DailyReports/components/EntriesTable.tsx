import { APPOINTMENTS_QUALITY_LABELS, APPOINTMENTS_QUALITY_BADGE_CLASS } from '../types';
import { formatReportDate, formatReportDay, parseDateInput } from '../utils';
import type { DailyAgentStatRow } from '../types';

interface EntriesTableProps {
  entries: DailyAgentStatRow[];
}

/** جدول تفاصيل الأيام المسجّلة لإيجنت واحد خلال فترة معيّنة */
export function EntriesTable({ entries }: EntriesTableProps) {
  if (entries.length === 0) {
    return <p className="text-sm text-secondary-400 text-center py-4">لا توجد أيام مسجّلة لهذه الفترة</p>;
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm text-start">
        <thead>
          <tr className="text-secondary-500 border-b border-secondary-100">
            <th className="py-2 px-2 font-medium">التاريخ</th>
            <th className="py-2 px-2 font-medium">الالتزام</th>
            <th className="py-2 px-2 font-medium">مكالمات</th>
            <th className="py-2 px-2 font-medium">نتج عنها مواعيد</th>
            <th className="py-2 px-2 font-medium">مواعيد فعلية</th>
            <th className="py-2 px-2 font-medium">جودة المواعيد</th>
            <th className="py-2 px-2 font-medium">عملاء جدد</th>
            <th className="py-2 px-2 font-medium">outdoor</th>
          </tr>
        </thead>
        <tbody>
          {entries
            .slice()
            .sort((a, b) => b.report_date.localeCompare(a.report_date))
            .map((e) => {
              const d = parseDateInput(e.report_date);
              return (
                <tr key={e.id} className="border-b border-secondary-50 last:border-0">
                  <td className="py-2 px-2 whitespace-nowrap">{formatReportDate(d)} <span className="text-secondary-400">({formatReportDay(d)})</span></td>
                  <td className="py-2 px-2">
                    <span className={`badge ${e.punctuality_ok ? 'badge-success' : 'badge-error'}`}>{e.punctuality_ok ? 'نعم' : 'لا'}</span>
                  </td>
                  <td className="py-2 px-2">{e.calls_actual}</td>
                  <td className="py-2 px-2">{e.calls_to_appointments}</td>
                  <td className="py-2 px-2">{e.appointments_actual}</td>
                  <td className="py-2 px-2">
                    {e.appointments_quality ? (
                      <span className={APPOINTMENTS_QUALITY_BADGE_CLASS[e.appointments_quality]}>
                        {APPOINTMENTS_QUALITY_LABELS[e.appointments_quality]}
                      </span>
                    ) : (
                      <span className="text-secondary-300">—</span>
                    )}
                  </td>
                  <td className="py-2 px-2">{e.new_clients}</td>
                  <td className="py-2 px-2">{e.is_outdoor ? 'نعم' : '—'}</td>
                </tr>
              );
            })}
        </tbody>
      </table>
    </div>
  );
}
