import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { POLICY_TYPE_LABELS, POLICY_STATUS_LABELS } from '../../../lib/supabase';

export const formatCurrency = (amount: number) => {
  return new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 0
  }).format(amount);
};

export function computeCustomersReport(customers: any[]) {
  const byMonth: Record<string, number> = {};
  customers.forEach((c: any) => {
    const month = format(new Date(c.created_at), 'MMM yyyy', { locale: ar });
    byMonth[month] = (byMonth[month] || 0) + 1;
  });

  const chart = Object.entries(byMonth).map(([month, count]) => ({
    name: month,
    value: count
  }));

  const details = customers.map((c: any) => ({
    'اسم العميل': c.name,
    'تاريخ التسجيل': format(new Date(c.created_at), 'd MMMM yyyy', { locale: ar })
  }));

  return {
    data: { customers: customers.length, total: customers.length, details },
    chartData: chart,
  };
}

export function computePoliciesReport(policies: any[]) {
  const byStatus = {
    active: policies.filter((p) => p.status === 'active').length,
    suspended: policies.filter((p) => p.status === 'suspended').length,
    cancelled: policies.filter((p) => p.status === 'cancelled').length
  };

  const byType: Record<string, number> = {};
  policies.forEach((p: any) => {
    const type = p.policy_type;
    byType[type] = (byType[type] || 0) + 1;
  });

  const chart = [
    { name: 'نشط', value: byStatus.active, color: '#22c55e' },
    { name: 'موقوف', value: byStatus.suspended, color: '#f59e0b' },
    { name: 'ملغى', value: byStatus.cancelled, color: '#ef4444' }
  ];

  const details = policies.map((p: any) => ({
    'رقم الوثيقة': p.policy_number,
    'العميل': p.customer?.name || '-',
    'النوع': POLICY_TYPE_LABELS[p.policy_type as keyof typeof POLICY_TYPE_LABELS] || p.policy_type,
    'الحالة': POLICY_STATUS_LABELS[p.status as keyof typeof POLICY_STATUS_LABELS] || p.status,
    'تاريخ البداية': p.start_date ? format(new Date(p.start_date), 'd MMMM yyyy', { locale: ar }) : '-'
  }));

  return {
    data: { total: policies.length, byStatus, byType, details },
    chartData: chart,
  };
}

export function computeProductionReport(payments: any[], userIds: string[]) {
  const filtered = payments.filter(
    (p: any) => userIds.includes(p.installment?.policy?.owner_id) && p.installment?.is_first
  );
  return computeProductionOrCollection(filtered);
}

export function computeCollectionReport(payments: any[], userIds: string[]) {
  const filtered = payments.filter(
    (p: any) => userIds.includes(p.installment?.policy?.owner_id) && !p.installment?.is_first
  );
  return computeProductionOrCollection(filtered);
}

function computeProductionOrCollection(filtered: any[]) {
  const byMonth: Record<string, number> = {};
  filtered.forEach((p: any) => {
    const month = format(new Date(p.payment_month), 'MMM yyyy', { locale: ar });
    byMonth[month] = (byMonth[month] || 0) + Number(p.amount);
  });

  const total = filtered.reduce((sum: number, p: any) => sum + Number(p.amount), 0);
  const chart = Object.entries(byMonth).map(([month, value]) => ({ name: month, value }));

  const details = filtered.map((p: any) => ({
    'العميل': p.installment?.policy?.customer?.name || '-',
    'الوكيل': p.installment?.policy?.owner?.name || '-',
    'رقم الوثيقة': p.installment?.policy?.policy_number || '-',
    'الشهر': format(new Date(p.payment_month), 'MMM yyyy', { locale: ar }),
    'المبلغ': formatCurrency(Number(p.amount))
  }));

  return {
    data: { total, count: filtered.length, details },
    chartData: chart,
  };
}

export function computeOverdueReport(installments: any[], userIds: string[]) {
  const overdue = installments.filter(
    (i: any) => userIds.includes(i.policy?.owner_id) && new Date(i.due_date) < new Date() && i.status !== 'paid'
  );

  const total = overdue.reduce((sum: number, i: any) => sum + Number(i.amount), 0);
  const chart = [{ name: 'متأخر', value: total }];

  const details = overdue.map((i: any) => ({
    'العميل': i.policy?.customer?.name || '-',
    'رقم الوثيقة': i.policy?.policy_number || '-',
    'تاريخ الاستحقاق': format(new Date(i.due_date), 'd MMMM yyyy', { locale: ar }),
    'المبلغ': formatCurrency(Number(i.amount))
  }));

  return {
    data: { total, count: overdue.length, details },
    chartData: chart,
  };
}

export function computeAgentsReport(agents: any[], payments: any[]) {
  const agentPerformance: any[] = [];

  for (const agent of agents) {
    const achieved = payments
      .filter((p: any) => p.installment?.policy?.owner_id === agent.id)
      .reduce((sum: number, p: any) => sum + Number(p.amount), 0);

    agentPerformance.push({
      name: agent.name,
      achieved,
      target: agent.target || 0,
      rate: agent.target > 0 ? Math.round((achieved / agent.target) * 100) : 0
    });
  }

  const sorted = agentPerformance.sort((a, b) => b.achieved - a.achieved);

  const details = sorted.map((a: any) => ({
    'اسم الوكيل': a.name,
    'المحقق': formatCurrency(a.achieved),
    'الهدف': formatCurrency(a.target),
    'نسبة التحقيق': `${a.rate}%`
  }));

  return {
    data: { agents: sorted, details },
    chartData: sorted.slice(0, 10),
  };
}

export function computeTeamPerformanceReport(
  performance: { id: string; name: string; count: number; achieved: number }[],
  labelKey: 'رئيس المجموعة' | 'المراقب',
) {
  const details = performance.map((p) => ({
    [labelKey]: p.name,
    'عدد الأعضاء': p.count,
    'المحقق': formatCurrency(p.achieved)
  }));

  return { details };
}
