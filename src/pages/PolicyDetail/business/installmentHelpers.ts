import type { InstallmentWithPayment } from '../types';

// ===================================
// هل القسط قابل للسداد؟
// قسط مدفوع مسبقاً (future) أو pending/overdue = يمكن سداده
// ===================================
export const canPay = (inst: InstallmentWithPayment) => {
  return inst.status === 'pending' || inst.status === 'overdue';
};

// هل هذا سداد مبكر؟ (تاريخ استحقاق في المستقبل)
export const isEarlyPayment = (inst: InstallmentWithPayment) => {
  return new Date(inst.due_date) > new Date() && inst.status === 'pending';
};

// ===================================
// إحصائيات الأقساط
// ===================================
export const computeInstallmentStats = (installments: InstallmentWithPayment[]) => ({
  total: installments.length,
  paid: installments.filter((i) => i.status === 'paid').length,
  pending: installments.filter((i) => i.status === 'pending').length,
  overdue: installments.filter((i) => i.status === 'overdue').length,
});

export const getInstallmentBadgeClass = (status: string) => {
  switch (status) {
    case 'paid':    return 'badge-success';
    case 'overdue': return 'badge-error';
    default:        return 'badge-secondary';
  }
};

export const getPolicyStatusBadgeClass = (status: string) => {
  switch (status) {
    case 'active':    return 'badge-success';
    case 'suspended': return 'badge-warning';
    case 'cancelled': return 'badge-error';
    default:          return 'badge-secondary';
  }
};
