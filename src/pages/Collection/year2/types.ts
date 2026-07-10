import type { Policy } from '../../../lib/supabase';

// ملاحظة مهمة: هذا الجدول/الشاشة منفصلة تماماً عن installments/payments
// (السنة الأولى). لا يُستخدم في أي تارجت/محقق/إحصائية — فقط متابعة وطباعة
// ما تم تحصيله من وثائق دخلت سنتها الثانية.

export type Year2Payment = {
  id: string;
  policy_id: string;
  amount: number;
  payment_date: string;
  payment_month: string;
  paid_by_user_id: string;
  notes?: string;
  is_cancelled: boolean;
  cancelled_at?: string;
  cancelled_by_user_id?: string;
  cancel_reason?: string;
  created_at: string;
  paid_by?: { name: string };
};

// وثيقة مؤهلة لشاشة السنة الثانية (أكملت سنة كاملة من start_date) مع إجمالي
// ما تم تحصيله لها في السنة الثانية
export type Year2EligiblePolicy = Policy & {
  customer: { name: string };
  owner: { name: string };
  year2_total_paid: number;
};

export type PrintPeriodType = 'month' | 'quarter' | 'year';

export interface Year2ReportRow extends Year2Payment {
  policy: Policy & { customer: { name: string }; owner: { name: string } };
}
