import type { Policy, Installment } from '../../lib/supabase';

// ===================================
// أنواع البيانات
// ===================================
export type InstallmentWithPayment = Installment & {
  payments?: { id: string; is_cancelled: boolean }[];
};

export type PolicyWithRelations = Policy & {
  customer: { id: string; name: string; phone?: string; national_id?: string };
  owner: { id: string; name: string };
};
