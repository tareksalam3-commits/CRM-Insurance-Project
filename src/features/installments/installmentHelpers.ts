import type { Installment } from '../../lib/supabase';

// ===================================
// مصدر واحد لكل منطق عرض الأقساط (حالة، إمكانية السداد، إحصائيات)
// يُستخدم فى: صفحة التحصيل والسداد، صفحة تفاصيل الوثيقة، صفحة العملاء.
// أي تعديل هنا ينعكس تلقائياً فى الثلاث أماكن دون أي تكرار كود.
// ===================================

// هل القسط قابل للسداد؟ (لسه معلّق أو متأخر)
export const canPay = (inst: Pick<Installment, 'status'>) => {
  return inst.status === 'pending' || inst.status === 'overdue';
};

// هل هذا سداد مبكر؟ (تاريخ استحقاق في المستقبل ولسه معلّق)
export const isEarlyPayment = (inst: Pick<Installment, 'due_date' | 'status'>) => {
  return new Date(inst.due_date) > new Date() && inst.status === 'pending';
};

// ===================================
// إحصائيات الأقساط — نفس الحساب المستخدم فى بطاقات صفحة تفاصيل الوثيقة
// وملخص بطاقة الوثيقة داخل صفحة العملاء
// ===================================
export const computeInstallmentStats = (installments: Pick<Installment, 'status'>[]) => ({
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
    case 'cancelled': return 'badge-error';
    default:          return 'badge-secondary';
  }
};

export const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 0,
  }).format(amount);
