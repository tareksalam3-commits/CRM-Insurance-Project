import { format } from 'date-fns';
import { POLICY_TYPE_LABELS, PAYMENT_METHOD_LABELS, POLICY_STATUS_LABELS, type Policy } from '../../../lib/supabase';
import { formatCurrency } from '../utils/formatCurrency';

// بناء نص HTML بيانات/طباعة الوثيقة — نفس المنطق بالضبط المنقول من
// handlePrintPolicy فى index.tsx الأصلي، بدون أي تغيير فى المحتوى أو
// التنسيق. الدالة هنا نقية (Pure) فقط: تبني الـ HTML، بدون فتح نافذة أو أي
// Side Effect — ده يفضل مسؤولية المكوّن/الـ Hook.
export function buildPolicyPrintHtml(policy: Policy): string {
  const customerName = (policy as any).customer?.name || '-';
  const ownerName = (policy as any).owner?.name || '-';

  return `
      <html dir="rtl" lang="ar">
        <head>
          <title>وثيقة ${policy.policy_number}</title>
          <style>
            body { font-family: 'Cairo', 'Segoe UI', sans-serif; padding: 32px; color: #0f172a; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            .muted { color: #64748b; font-size: 13px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 12px; }
            td { padding: 12px; border-bottom: 1px solid #e2e8f0; font-size: 14px; }
            td:first-child { color: #64748b; width: 180px; }
          </style>
        </head>
        <body>
          <h1>وثيقة تأمين رقم ${policy.policy_number}</h1>
          <p class="muted">تاريخ الطباعة: ${format(new Date(), 'dd/MM/yyyy')}</p>
          <table>
            <tr><td>اسم العميل</td><td>${customerName}</td></tr>
            <tr><td>نوع الوثيقة</td><td>${POLICY_TYPE_LABELS[policy.policy_type]}</td></tr>
            <tr><td>تاريخ بداية التأمين</td><td>${format(new Date(policy.start_date), 'dd/MM/yyyy')}</td></tr>
            <tr><td>طريقة السداد</td><td>${PAYMENT_METHOD_LABELS[policy.payment_method]}</td></tr>
            <tr><td>قيمة القسط الصافي</td><td>${formatCurrency(policy.premium_amount)}</td></tr>
            <tr><td>مبلغ التأمين</td><td>${policy.sum_assured ? formatCurrency(policy.sum_assured) : '-'}</td></tr>
            <tr><td>حالة الوثيقة</td><td>${POLICY_STATUS_LABELS[policy.status]}</td></tr>
            <tr><td>اسم الوكيل</td><td>${ownerName}</td></tr>
          </table>
        </body>
      </html>
    `;
}
