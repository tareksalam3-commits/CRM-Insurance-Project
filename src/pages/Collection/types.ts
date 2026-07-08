import type { Installment, Policy } from '../../lib/supabase';

export type TabType = 'new_production' | 'periodic' | 'overdue' | 'paid_new' | 'paid_periodic';

export type InstallmentWithRelations = Installment & {
  policy: Policy & { customer: { name: string }; owner: { name: string } };
};

export const VALID_TABS: TabType[] = ['new_production', 'periodic', 'overdue', 'paid_new', 'paid_periodic'];
