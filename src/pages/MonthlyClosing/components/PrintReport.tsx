import { ROLE_LABELS } from '../../../lib/supabase';
import { useSettings } from '../../../hooks/useSettings';
import type { SupervisorAgg, PrintDetailRow } from '../types';
import { fmt, last6 } from '../utils';

// ─── Print Report (structured, print-only) ────────────────
// يظهر فقط عند الطباعة — صفحة تجميعات أولى (هيكل إداري بحت) ثم صفحات تفاصيل العمليات المسددة
export function PrintReport({
  supervisorName, supervisorRoleLabel, monthLabel, closingDate,
  printSupervisors, printDetailRows,
  grandProduction, grandCollection, grandTotal,
}: {
  supervisorName: string;
  supervisorRoleLabel: string;
  monthLabel: string;
  closingDate: string;
  printSupervisors: SupervisorAgg[];
  printDetailRows: PrintDetailRow[];
  grandProduction: number;
  grandCollection: number;
  grandTotal: number;
}) {
  const { branding } = useSettings();
  return (
    <div className="hidden print:block print-report" dir="rtl">
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm 12mm 14mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .print-report {
          font-family: 'Tahoma', 'Segoe UI', 'Arial', sans-serif;
          color: #1f2937;
          font-size: 11.5px;
          line-height: 1.5;
        }
        .print-report .pr-page-break { page-break-before: always; break-before: page; }

        .print-report table { width: 100%; border-collapse: collapse; table-layout: fixed; }
        .print-report th, .print-report td { border: 1px solid #d8dce1; padding: 6px 8px; text-align: center; }
        .print-report th {
          background: #15803d;
          color: #fff;
          font-weight: 700;
          letter-spacing: 0.2px;
        }
        .print-report tbody tr:nth-child(even) { background: #f7f9f7; }

        /* ترويسة الشركة والعنوان */
        .print-report .pr-company { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 4px; }
        .print-report .pr-company img { width: 30px; height: 30px; object-fit: contain; }
        .print-report .pr-company span { font-size: 13px; font-weight: 700; color: #15803d; letter-spacing: 0.3px; }
        .print-report .pr-title { text-align: center; font-size: 19px; font-weight: 800; color: #14532d; margin-bottom: 2px; }
        .print-report .pr-sub { text-align: center; font-size: 11.5px; color: #6b7280; margin-bottom: 12px; font-weight: 500; }
        .print-report .pr-title-rule { height: 3px; width: 64px; background: #16a34a; border-radius: 2px; margin: 6px auto 14px; }

        .print-report .pr-meta {
          display: flex; justify-content: space-between; font-size: 11.5px;
          margin-bottom: 12px; padding: 8px 12px; background: #f0fdf4;
          border: 1px solid #bbf7d0; border-radius: 6px;
          width: 100%; box-sizing: border-box;
        }
        .print-report .pr-meta b { color: #166534; }
        .print-report .pr-detail-title-row th,
        .print-report .pr-detail-meta-row th { width: auto; }

        .print-report .pr-sup-name {
          font-weight: 800; font-size: 12.5px; color: #14532d;
          padding: 4px 2px; border-bottom: 1.5px solid #16a34a; margin: 10px 0 5px;
        }
        .print-report .pr-group-row td:first-child { text-align: right; font-weight: 600; }
        .print-report .pr-totals-row td { font-weight: 800; background: #dcfce7 !important; color: #14532d; }

        .print-report .pr-grand-box {
          border: 1.5px solid #16a34a; border-radius: 8px;
          padding: 12px 16px; margin-top: 18px; background: #f9fafb;
        }
        .print-report .pr-grand-box .row { display:flex; justify-content: space-between; padding: 3px 0; font-size: 12.5px; color: #374151; }
        .print-report .pr-grand-box .row.total {
          font-weight: 800; font-size: 15px; color: #14532d;
          border-top: 1px dashed #86efac; margin-top: 5px; padding-top: 8px;
        }

        /* جدول التفاصيل: عنوان التقرير ورأس الجدول يتكرران تلقائياً في كل صفحة مطبوعة */
        .print-report .pr-detail-table thead { display: table-header-group; }
        .print-report .pr-detail-table tfoot { display: table-footer-group; }
        .print-report .pr-detail-table tr { page-break-inside: avoid; }
        .print-report .pr-detail-title-row th { background: #fff; border: none; padding: 0 0 4px; }
        .print-report .pr-detail-title-row .pr-title { margin-bottom: 0; }
        .print-report .pr-detail-meta-row th { background: #fff; border: none; padding: 0 0 10px; }
        .print-report .pr-detail-meta-row .pr-meta { margin-bottom: 0; }

        /* تذييل يتكرر أسفل كل صفحة مطبوعة، ويحمل رقم الصفحة */
        .print-report { counter-reset: pr-page; }
        .print-report .pr-footer {
          position: fixed; bottom: -10mm; left: 0; right: 0;
          text-align: center; font-size: 9.5px; color: #9ca3af;
          border-top: 1px solid #e5e7eb; padding-top: 4px;
          counter-increment: pr-page;
        }
        .print-report .pr-footer .pr-page-num::before {
          content: "صفحة " counter(pr-page);
        }
      `}</style>

      {/* ══ صفحة 1: التجميعات (هيكل إداري بحت — بدون تفاصيل عملاء) ══ */}
      <div className="pr-company">
        {branding.company_logo_url && <img src={branding.company_logo_url} alt={branding.company_name} />}
        <span>{branding.company_name}</span>
      </div>
      <div className="pr-title">تقرير تقفيل الشهر</div>
      <div className="pr-sub">صفحة التجميعات</div>
      <div className="pr-title-rule" />
      <div className="pr-meta">
        <span><b>{supervisorRoleLabel}:</b> {supervisorName}</span>
        <span><b>الشهر:</b> {monthLabel}</span>
        <span><b>تاريخ التقفيل:</b> {closingDate}</span>
      </div>

      {printSupervisors.map((sv) => (
        <div key={sv.id} style={{ marginBottom: 10 }}>
          <div className="pr-sup-name" style={{ margin: '8px 0 4px' }}>
            {ROLE_LABELS['supervisor']}: {sv.name}
          </div>
          <table>
            <thead>
              <tr>
                <th style={{ width: '32%' }}>رئيس المجموعة</th>
                <th>إجمالي الجديد</th>
                <th>إجمالي التحصيل</th>
                <th>الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {sv.groupLeaders.map((gl) => (
                <tr key={gl.id} className="pr-group-row">
                  <td>{gl.name}</td>
                  <td>{fmt(gl.production)}</td>
                  <td>{fmt(gl.collection)}</td>
                  <td>{fmt(gl.total)}</td>
                </tr>
              ))}
              {sv.groupLeaders.length === 0 && (
                <tr><td colSpan={4}>لا توجد مجموعات لهذا المراقب</td></tr>
              )}
              <tr className="pr-totals-row">
                <td>إجمالي {sv.name}</td>
                <td>{fmt(sv.production)}</td>
                <td>{fmt(sv.collection)}</td>
                <td>{fmt(sv.total)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      ))}

      {printSupervisors.length === 0 && (
        <p style={{ textAlign: 'center', margin: '20px 0' }}>لا توجد بيانات لهذا الشهر</p>
      )}

      <div className="pr-grand-box">
        <div className="row"><span>إجمالي {supervisorRoleLabel} — الإنتاج الجديد</span><span>{fmt(grandProduction)}</span></div>
        <div className="row"><span>إجمالي {supervisorRoleLabel} — التحصيل</span><span>{fmt(grandCollection)}</span></div>
        <div className="row total"><span>إجمالي {supervisorRoleLabel} — الإجمالي الكلي</span><span>{fmt(grandTotal)}</span></div>
      </div>

      {/* ══ الصفحة الثانية وما بعدها: كل عمليات السداد خلال الشهر — جدول واحد مسطّح ══ */}
      <div className="pr-page-break">
        <table className="pr-detail-table">
          <thead>
            <tr className="pr-detail-title-row">
              <th colSpan={8}>
                <div className="pr-company">
                  {branding.company_logo_url && <img src={branding.company_logo_url} alt={branding.company_name} />}
                  <span>{branding.company_name}</span>
                </div>
                <div className="pr-title">تقرير تقفيل الشهر</div>
              </th>
            </tr>
            <tr className="pr-detail-meta-row">
              <th colSpan={8}>
                <div className="pr-meta">
                  <span><b>{supervisorRoleLabel}:</b> {supervisorName}</span>
                  <span><b>الشهر:</b> {monthLabel}</span>
                  <span><b>تفاصيل عمليات السداد</b></span>
                </div>
              </th>
            </tr>
            <tr>
              <th>المراقب</th>
              <th>رئيس المجموعة</th>
              <th>الوكيل</th>
              <th>العميل</th>
              <th>آخر 6 أرقام الوثيقة</th>
              <th>رقم القسط</th>
              <th>قيمة القسط</th>
              <th>نوع العملية</th>
            </tr>
          </thead>
          <tbody>
            {printDetailRows.map((r, i) => (
              <tr key={i}>
                <td>{r.supervisorName}</td>
                <td>{r.groupLeaderName}</td>
                <td>{r.agentName}</td>
                <td style={{ textAlign: 'right' }}>{r.customerName}</td>
                <td dir="ltr">{last6(r.policyNumber)}</td>
                <td>{r.installmentNumber}</td>
                <td>{fmt(r.amount)}</td>
                <td>{r.type === 'new' ? 'جديد' : 'تحصيل'}</td>
              </tr>
            ))}
            {printDetailRows.length === 0 && (
              <tr><td colSpan={8}>لا توجد عمليات سداد مسجّلة لهذا الشهر</td></tr>
            )}
          </tbody>
          <tfoot>
            <tr className="pr-totals-row">
              <td colSpan={6}>الإجمالي الكلي لعمليات السداد</td>
              <td colSpan={2}>{fmt(grandTotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      <div className="pr-footer">
        {branding.company_name} · تقرير تقفيل الشهر — {monthLabel} · <span className="pr-page-num" />
      </div>
    </div>
  );
}
