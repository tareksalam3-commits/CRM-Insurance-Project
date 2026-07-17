import { useSettings } from '../../hooks/useSettings';
import type { CalculationResult } from './pricingEngine';
import { formatCurrency } from './pricingEngine';

// ─── عرض سعر قابل للطباعة / حفظ PDF (يظهر فقط عند الطباعة) ───
// هذا العرض لا يُحفظ داخل النظام، فقط لعرض/طباعة نتيجة الحاسبة لحظياً.
export function PrintQuote({ result }: { result: CalculationResult }) {
  const { branding } = useSettings();

  const dateLabel = new Intl.DateTimeFormat('ar-EG', {
    dateStyle: 'long',
    timeStyle: 'short',
  }).format(result.calculatedAt);

  return (
    <div className="hidden print:block print-quote" dir="rtl">
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm 14mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
        .print-quote { font-family: 'Tahoma', 'Arial', sans-serif; color: #111; font-size: 13px; }
        .print-quote .pq-company { display: flex; align-items: center; justify-content: center; gap: 8px; margin-bottom: 8px; }
        .print-quote .pq-company img { width: 32px; height: 32px; object-fit: contain; }
        .print-quote .pq-company span { font-size: 15px; font-weight: 700; color: #333; }
        .print-quote .pq-title { text-align: center; font-size: 20px; font-weight: 800; margin-bottom: 2px; }
        .print-quote .pq-sub { text-align: center; font-size: 12px; color: #555; margin-bottom: 18px; }
        .print-quote .pq-meta { border: 1px solid #ccc; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; }
        .print-quote .pq-meta .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; }
        .print-quote .pq-meta .row b { font-weight: 700; }
        .print-quote table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .print-quote th, .print-quote td { border: 1px solid #999; padding: 8px 10px; text-align: center; }
        .print-quote th { background: #eef2f7; font-weight: 700; }
        .print-quote .pq-highlight td { font-weight: 800; background: #f6f9fc; }
        .print-quote .pq-footer { margin-top: 24px; font-size: 11px; color: #666; text-align: center; }
      `}</style>

      <div className="pq-company">
        {branding.company_logo_url && <img src={branding.company_logo_url} alt={branding.company_name} />}
        <span>{branding.company_name}</span>
      </div>
      <div className="pq-title">عرض سعر تأميني</div>
      <div className="pq-sub">تم إنشاؤه بواسطة حاسبة الأسعار — للاستخدام أثناء مقابلة العميل</div>

      <div className="pq-meta">
        <div className="row"><span>نوع الوثيقة</span><b>{result.variant.label}</b></div>
        <div className="row"><span>السن</span><b>{result.age} سنة</b></div>
        <div className="row"><span>مبلغ التأمين</span><b>{formatCurrency(result.sumInsured)}</b></div>
        <div className="row"><span>تاريخ ووقت الحساب</span><b>{dateLabel}</b></div>
      </div>

      <table>
        <thead>
          <tr>
            <th>سنوي</th>
            <th>نصف سنوي</th>
            <th>ربع سنوي</th>
            <th>شهري</th>
          </tr>
        </thead>
        <tbody>
          <tr className="pq-highlight">
            <td>{formatCurrency(result.annualPremium)}</td>
            <td>{formatCurrency(result.semiAnnualPremium)}</td>
            <td>{formatCurrency(result.quarterlyPremium)}</td>
            <td>{formatCurrency(result.monthlyPremium)}</td>
          </tr>
        </tbody>
      </table>

      <div className="pq-footer">
        هذا العرض استرشادي وقابل للتغيير حسب شروط الاكتتاب النهائية — لا يُعد وثيقة تأمين سارية.
      </div>
    </div>
  );
}
