import type { UserRole } from '../../lib/supabase';

export interface DashboardStats {
  totalCustomers: number;
  totalPolicies: number;
  activePolicies: number;
  suspendedPolicies: number;
  cancelledPolicies: number;
  newProduction: number;
  newProductionCount: number;
  periodicCollection: number;
  periodicCollectionCount: number;
  dueInstallments: number;
  dueInstallmentsCount: number;
  overdueInstallments: number;
  overdueInstallmentsCount: number;
  paidInstallments: number;
  paidInstallmentsCount: number;
  target: number;
  achieved: number;
  remaining: number;
  achievementRate: number;
}

export interface TeamPerformance {
  id: string;
  name: string;
  role: UserRole;
  achieved: number;
  target: number;
}
