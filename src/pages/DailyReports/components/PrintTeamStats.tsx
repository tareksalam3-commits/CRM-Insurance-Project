import { useSettings } from '../../../hooks/useSettings';
import type { StatsAggregate, StatsTreeNode } from '../types';

export interface FlatStatsRow {
  name: string;
  roleLabel: string;
  depth: number;
  isAgent: boolean;
  aggregate: StatsAggregate;
}

/** يفرد الشجرة الهرمية إلى قائمة مسطّحة بترتيب DFS، مع الاحتفاظ بعمق كل
 * عقدة (depth) لعرضه كإزاحة فى الطباعة — تُستخدم بدل الشجرة القابلة للطي
 * لأن الطباعة الورقية محتاجة كل الصفوف ظاهرة دفعة واحدة */
export function flattenStatsTree(nodes: StatsTreeNode[], depth = 0): FlatStatsRow[] {
  const rows: FlatStatsRow[] = [];
  for (const node of nodes) {
    rows.push({
      name: node.name,
      roleLabel: node.roleLabel,
      depth,
      isAgent: node.own !== null,
      aggregate: node.own !== null ? node.own : node.subtree,
    });
    if (node.children.length > 0) {
      rows.push(...flattenStatsTree(node.children, depth + 1));
    }
  }
  return rows;
}

function punctualityPct(a: StatsAggregate): string {
  return a.entriesCount > 0 ? `${Math.round((a.punctualityOkCount / a.entriesCount) * 100)}%` : '—';
}

interface PrintTeamStatsProps {
  viewerName: string;
  viewerRoleLabel: string;
  branchName?: string | null;
  periodLabel: string;
  overallAggregate: StatsAggregate;
  rows: FlatStatsRow[];
}

/** تقرير طباعة الإحصائيات اليومية المجمّعة — يظهر فقط عند الطباعة، ويغطي
 * كل نطاق الشجرة (كل المجموعات والأفراد تحت الناظر) لفترة زمنية معيّنة */
export function PrintTeamStats({
  viewerName, viewerRoleLabel, branchName, periodLabel, overallAggregate, rows,
}: PrintTeamStatsProps) {
  const { branding } = useSettings();

  return (
    <div className="hidden print:block print-report" dir="rtl">
      <style>{`
        @media print {
          @page { size: A4 landscape; margin: 14mm 10mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .print-report {
          font-family: 'Tahoma', 'Segoe UI', 'Arial', sans-serif;
          color: #1f2937;
          font-size: 11px;
          line-height: 1.5;
        }
        .print-report .dr-company { display: flex; align-items: center; justify-content: center; gap: 10px; margin-bottom: 6px; }
        .print-report .dr-company img { width: 46px; height: 46px; object-fit: contain; }
        .print-report .dr-company span { font-size: 18px; font-weight: 800; color: #15803d; letter-spacing: 0.3px; }
        .print-report .dr-title { text-align: center; font-size: 17px; font-weight: 800; color: #14532d; margin-bottom: 2px; }
        .print-report .dr-title-rule { height: 3px; width: 64px; background: #16a34a; border-radius: 2px; margin: 6px auto 12px; }

        .print-report .dr-meta {
          display: flex; justify-content: space-between; flex-wrap: wrap; gap: 6px; font-size: 11px;
          margin-bottom: 10px; padding: 8px 12px; background: #f0fdf4;
          border: 1px solid #bbf7d0; border-radius: 6px;
        }
        .print-report .dr-meta b { color: #166534; }

        .print-report .dr-overall {
          border: 1.5px solid #16a34a; border-radius: 8px;
          padding: 8px 14px; margin-bottom: 12px; background: #f9fafb;
          display: flex; flex-wrap: wrap; gap: 14px; justify-content: space-between;
        }
        .print-report .dr-overall .item { text-align: center; font-size: 11px; color: #374151; }
        .print-report .dr-overall .item b { display: block; font-size: 14px; font-weight: 800; color: #14532d; }

        .print-report table { width: 100%; border-collapse: collapse; }
        .print-report th, .print-report td { border: 1px solid #d8dce1; padding: 5px 6px; text-align: center; }
        .print-report th { background: #15803d; color: #fff; font-weight: 700; font-size: 10.5px; }
        .print-report tbody tr:nth-child(even) { background: #f7f9f7; }
        .print-report td.dr-name { text-align: right; font-weight: 600; }
        .print-report tr.dr-branch td.dr-name { font-weight: 800; color: #14532d; background: #eef7f0 !important; }
        .print-report tr { page-break-inside: avoid; }

        .print-report .dr-footer {
          margin-top: 10px; text-align: center; font-size: 10px; color: #6b7280;
        }
      `}</style>

      <div className="dr-company">
        {branding.company_logo_url && <img src={branding.company_logo_url} alt={branding.company_name} />}
        <span>{branding.company_name}</span>
      </div>
      <div className="dr-title">تقرير الإحصائيات اليومية المجمّعة</div>
      <div className="dr-title-rule" />

      <div className="dr-meta">
        <span><b>{viewerRoleLabel}:</b> {viewerName}</span>
        <span><b>الفترة:</b> {periodLabel}</span>
        {branchName && <span><b>الفرع:</b> {branchName}</span>}
      </div>

      <div className="dr-overall">
        <div className="item"><b>{overallAggregate.entriesCount}</b>أيام مسجّلة</div>
        <div className="item"><b>{punctualityPct(overallAggregate)}</b>الالتزام</div>
        <div className="item"><b>{overallAggregate.callsActual}</b>إجمالي المكالمات</div>
        <div className="item"><b>{overallAggregate.callsToAppointments}</b>نتج عنها مواعيد</div>
        <div className="item"><b>{overallAggregate.appointmentsActual}</b>مواعيد فعلية</div>
        <div className="item"><b>{overallAggregate.newClients}</b>عملاء جدد</div>
        <div className="item"><b>{overallAggregate.outdoorDaysCount}</b>أيام outdoor</div>
      </div>

      <table>
        <thead>
          <tr>
            <th style={{ width: '20%' }}>الاسم</th>
            <th>الدرجة</th>
            <th>أيام مسجّلة</th>
            <th>الالتزام</th>
            <th>مكالمات</th>
            <th>نتج عنها مواعيد</th>
            <th>مواعيد فعلية</th>
            <th>ممتاز</th>
            <th>متوسط</th>
            <th>ضعيف</th>
            <th>عملاء جدد</th>
            <th>outdoor</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={row.isAgent ? undefined : 'dr-branch'}>
              <td className="dr-name" style={{ paddingRight: `${6 + row.depth * 14}px` }}>{row.name}</td>
              <td>{row.roleLabel}</td>
              <td>{row.aggregate.entriesCount}</td>
              <td>{punctualityPct(row.aggregate)}</td>
              <td>{row.aggregate.callsActual}</td>
              <td>{row.aggregate.callsToAppointments}</td>
              <td>{row.aggregate.appointmentsActual}</td>
              <td>{row.aggregate.appointmentsQualityCounts.excellent}</td>
              <td>{row.aggregate.appointmentsQualityCounts.average}</td>
              <td>{row.aggregate.appointmentsQualityCounts.weak}</td>
              <td>{row.aggregate.newClients}</td>
              <td>{row.aggregate.outdoorDaysCount}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={12}>لا توجد بيانات لهذه الفترة</td></tr>
          )}
        </tbody>
      </table>

      <div className="dr-footer">
        {branding.company_name} · تقرير الإحصائيات اليومية المجمّعة · {periodLabel}
      </div>
    </div>
  );
}
