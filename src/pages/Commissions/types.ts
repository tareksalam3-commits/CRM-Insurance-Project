// صفحة العمولات: مستقلة تماماً، للعرض فقط، لا تُخزَّن العمولات في قاعدة
// البيانات — تُحسب لحظياً من بيانات installments/payments (السنة الأولى)
// وbyear2_payments (سنوات التجديد) الموجودة بالفعل بالنظام.

export type CommissionType = 'year1' | 'renewal';

export interface CommissionRow {
  id: string;
  customerName: string;
  policyLast6: string;
  type: CommissionType;
  amount: number;
  dueDay: 5 | 20;
  dueMonth: string; // 'yyyy-MM'
}

export interface CommissionsSummary {
  totalMonth: number;
  dueOn5: number;
  dueOn20: number;
}
