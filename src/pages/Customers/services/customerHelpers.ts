import { format } from 'date-fns';
import { MARITAL_STATUS_LABELS, POLICY_STATUS_LABELS } from '../../../lib/supabase';
import type { CustomerWithRelations } from '../types';
import { formatCurrency, sortPoliciesByStartDate } from '../utils';

// بناء نص HTML بيانات/طباعة العميل — نفس المنطق بالضبط المنقول من
// handlePrintCustomer فى index.tsx الأصلي، بدون أي تغيير فى المحتوى أو
// التنسيق. الدالة هنا نقية (Pure) فقط: تبني الـ HTML، بدون فتح نافذة أو أي
// Side Effect — ده يفضل مسؤولية المكوّن/الـ Hook.
export function buildCustomerPrintHtml(customer: CustomerWithRelations): string {
  const sortedPolicies = sortPoliciesByStartDate(customer.policies || []);

  const policiesRows = sortedPolicies
    .map((p) => `<tr><td>${p.policy_number}</td><td>${POLICY_STATUS_LABELS[p.status]}</td><td>${formatCurrency(p.premium_amount)}</td><td>${format(new Date(p.start_date), 'dd/MM/yyyy')}</td></tr>`)
    .join('');

  return `
      <html dir="rtl" lang="ar">
        <head>
          <title>بيانات العميل - ${customer.name}</title>
          <style>
            body { font-family: 'Cairo', 'Segoe UI', sans-serif; padding: 32px; color: #0f172a; }
            h1 { font-size: 20px; margin-bottom: 4px; }
            h2 { font-size: 15px; margin-top: 28px; margin-bottom: 4px; }
            .muted { color: #64748b; font-size: 13px; margin-bottom: 20px; }
            table { width: 100%; border-collapse: collapse; margin-top: 8px; }
            td, th { padding: 10px 12px; border-bottom: 1px solid #e2e8f0; font-size: 13px; text-align: right; }
            td:first-child { color: #64748b; width: 170px; }
            th { color: #64748b; font-weight: 600; background: #f8fafc; }
          </style>
        </head>
        <body>
          <h1>بيانات العميل: ${customer.name}</h1>
          <p class="muted">تاريخ الطباعة: ${format(new Date(), 'dd/MM/yyyy')}</p>
          <table>
            <tr><td>الاسم</td><td>${customer.name}</td></tr>
            <tr><td>الرقم القومي</td><td>${customer.national_id || '-'}</td></tr>
            <tr><td>رقم الهاتف</td><td>${customer.phone || '-'}</td></tr>
            <tr><td>العنوان</td><td>${customer.address || '-'}</td></tr>
            <tr><td>تاريخ الميلاد</td><td>${customer.birth_date ? format(new Date(customer.birth_date), 'dd/MM/yyyy') : '-'}</td></tr>
            <tr><td>المهنة</td><td>${customer.occupation || '-'}</td></tr>
            <tr><td>الحالة الاجتماعية</td><td>${customer.marital_status ? MARITAL_STATUS_LABELS[customer.marital_status] : '-'}</td></tr>
            <tr><td>الوكيل المسؤول</td><td>${customer.owner?.name || '-'}</td></tr>
          </table>
          ${sortedPolicies.length > 0 ? `
          <h2>الوثائق (${sortedPolicies.length})</h2>
          <table>
            <tr><th>رقم الوثيقة</th><th>الحالة</th><th>قيمة القسط</th><th>تاريخ البداية</th></tr>
            ${policiesRows}
          </table>` : ''}
        </body>
      </html>
    `;
}
