import { CheckCircle, Clock, AlertTriangle, CreditCard, XCircle } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

import type { Installment, PolicyStatus } from '../../lib/supabase';
import { INSTALLMENT_STATUS_LABELS } from '../../lib/supabase';
import { canPay, isEarlyPayment, getInstallmentBadgeClass, formatCurrency } from './installmentHelpers';

// ===================================
// جدول الأقساط الموحّد — مكوّن واحد فقط يُعاد استخدامه فى:
// - صفحة التحصيل والسداد (مودال أقساط الوثيقة)
// - صفحة الوثائق → تفاصيل الوثيقة
// - صفحة العملاء → تفاصيل الوثيقة
// أي تطوير أو تعديل هنا يظهر تلقائياً فى الثلاث أماكن.
// ===================================
interface InstallmentsTableProps {
  installments: Installment[];
  loading?: boolean;
  // لو اتحددت، زر "سداد" بيتقفل تلقائياً لو الوثيقة مش نشطة (نفس شرط صفحة
  // تفاصيل الوثيقة الحالي). لو مش متحددة، الزر بيعتمد فقط على حالة القسط.
  policyStatus?: PolicyStatus;
  onPay: (installment: Installment) => void;
  onCancel: (installment: Installment) => void;
  emptyMessage?: string;
}

export function InstallmentsTable({
  installments,
  loading = false,
  policyStatus,
  onPay,
  onCancel,
  emptyMessage = 'لا توجد أقساط لهذه الوثيقة',
}: InstallmentsTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (installments.length === 0) {
    return <p className="text-center text-secondary-500 py-8">{emptyMessage}</p>;
  }

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="w-4 h-4 text-success-600" />;
      case 'overdue':
        return <AlertTriangle className="w-4 h-4 text-error-600" />;
      default:
        return <Clock className="w-4 h-4 text-secondary-400" />;
    }
  };

  const payAllowed = (inst: Installment) => canPay(inst) && (policyStatus ? policyStatus === 'active' : true);

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>رقم القسط</th>
            <th>تاريخ الاستحقاق</th>
            <th>المبلغ</th>
            <th>الحالة</th>
            <th>تاريخ السداد</th>
            <th>إجراء</th>
          </tr>
        </thead>
        <tbody>
          {installments.map((inst) => (
            <tr key={inst.id}>
              <td>
                <div className="flex items-center gap-2">
                  <span className="font-medium">{inst.installment_number}</span>
                  {inst.is_first && (
                    <span className="badge badge-primary text-xs">إنتاج جديد</span>
                  )}
                </div>
              </td>

              <td>
                <div className="flex items-center gap-1.5">
                  {format(new Date(inst.due_date), 'dd/MM/yyyy')}
                  {isEarlyPayment(inst) && (
                    <span className="badge bg-blue-100 text-blue-700 text-xs">مبكر</span>
                  )}
                </div>
              </td>

              <td>{formatCurrency(inst.amount)}</td>

              <td>
                <div className="flex items-center gap-1.5">
                  {getStatusIcon(inst.status)}
                  <span className={clsx('badge', getInstallmentBadgeClass(inst.status))}>
                    {INSTALLMENT_STATUS_LABELS[inst.status]}
                  </span>
                </div>
              </td>

              <td>
                {inst.paid_at
                  ? format(new Date(inst.paid_at), 'dd/MM/yyyy HH:mm', { locale: ar })
                  : '—'}
              </td>

              <td>
                {inst.status === 'paid' ? (
                  <button onClick={() => onCancel(inst)} className="btn btn-secondary btn-sm">
                    <XCircle className="w-3.5 h-3.5" />
                    <span>إلغاء السداد</span>
                  </button>
                ) : payAllowed(inst) ? (
                  <button onClick={() => onPay(inst)} className="btn btn-primary btn-sm">
                    <CreditCard className="w-3.5 h-3.5" />
                    <span>سداد</span>
                    {isEarlyPayment(inst) && <span className="text-xs opacity-75">(مبكر)</span>}
                  </button>
                ) : (
                  <span className="text-secondary-400 text-sm">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
