import { format } from 'date-fns';
import type { Year2ReportRow } from './types';

export function PrintYear2Report({
  periodLabel,
  rows,
  total,
  generatedByName,
}: {
  periodLabel: string;
  rows: Year2ReportRow[];
  total: number;
  generatedByName: string;
}) {
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0 }).format(amount);

  return (
    <div className="hidden print:block print-report" dir="rtl">
      <style>{`
        @media print {
          @page { size: A4; margin: 14mm 12mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .print-report { font-family: 'Tahoma', 'Arial', sans-serif; color: #111; font-size: 12px; }
        .print-report table { width: 100%; border-collapse: collapse; }
        .print-report th, .print-report td { border: 1px solid #999; padding: 4px 6px; text-align: center; }
        .print-report th { background: #e8e8e8; font-weight: 700; }
        .print-report .pr-title { text-align: center; font-size: 18px; font-weight: 800; margin-bottom: 2px; }
        .print-report .pr-sub { text-align: center; font-size: 12px; color: #444; margin-bottom: 14px; }
        .print-report .pr-meta { display: flex; justify-content: space-between; font-size: 12px; margin-bottom: 10px; border-bottom: 2px solid #333; padding-bottom: 6px; }
        .print-report .pr-detail-table thead { display: table-header-group; }
        .print-report .pr-detail-table tfoot { display: table-footer-group; }
        .print-report .pr-detail-table tr { page-break-inside: avoid; }
        .print-report .pr-totals-row td { font-weight: 800; background: #f6f6f6; }
      `}</style>

      <div className="pr-title">تقرير تحصيلات السنة الثانية</div>
      <div className="pr-sub">للمتابعة فقط — لا يدخل ضمن التارجت أو المحقق أو أي إحصائية</div>
      <div className="pr-meta">
        <span><b>الفترة:</b> {periodLabel}</span>
        <span><b>عدد العمليات:</b> {rows.length}</span>
        <span><b>تاريخ الطباعة:</b> {format(new Date(), 'dd/MM/yyyy')}</span>
      </div>

      <table className="pr-detail-table">
        <thead>
          <tr>
            <th>رقم الوثيقة</th>
            <th>العميل</th>
            <th>المسؤول</th>
            <th>تاريخ التحصيل</th>
            <th>المبلغ</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id}>
              <td>{row.policy?.policy_number}</td>
              <td>{row.policy?.customer?.name}</td>
              <td>{row.policy?.owner?.name}</td>
              <td>{format(new Date(row.payment_date), 'dd/MM/yyyy')}</td>
              <td>{formatCurrency(row.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="pr-totals-row">
            <td colSpan={4}>الإجمالي</td>
            <td>{formatCurrency(total)}</td>
          </tr>
        </tfoot>
      </table>

      <div style={{ marginTop: 24, fontSize: 12 }}>
        تم إعداد التقرير بواسطة: {generatedByName}
      </div>
    </div>
  );
}
