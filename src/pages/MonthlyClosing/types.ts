import type { UserRole } from '../../lib/supabase';

// ─── types ────────────────────────────────────────────────
export interface PaymentRow {
  id: string;
  amount: number;
  paid_at: string;
  installment: {
    installment_number: number;
    is_first: boolean;
    policy: {
      policy_number: string;
      owner_id: string;
      customer: { name: string };
    };
  };
}

export interface AgentSummary {
  id: string;
  name: string;
  role: UserRole;
  manager_id: string | null;
  production: number;
  collection: number;
  total: number;
  details: {
    customerName: string;
    policyNumber: string;
    installmentNumber: number;
    type: 'new' | 'collection';
    amount: number;
    paidAt: string;
  }[];
}

export interface GroupSummary {
  leaderId: string;
  leaderName: string;
  leaderRole: UserRole;
  production: number;
  collection: number;
  total: number;
  agents: AgentSummary[];
  agentCount: number;
}

export interface SupervisorSummary {
  supervisorId: string;
  supervisorName: string;
  supervisorRole: UserRole;
  production: number;
  collection: number;
  total: number;
  groups: GroupSummary[];
}

export interface GroupLeaderAgg {
  id: string;
  name: string;
  production: number;
  collection: number;
  total: number;
}

export interface SupervisorAgg {
  id: string;
  name: string;
  groupLeaders: GroupLeaderAgg[];
  production: number;
  collection: number;
  total: number;
}

export interface PrintDetailRow {
  supervisorName: string;
  groupLeaderName: string;
  agentName: string;
  customerName: string;
  policyNumber: string;
  installmentNumber: number;
  amount: number;
  type: 'new' | 'collection';
}

export interface BasicUser {
  id: string;
  name: string;
  role: UserRole;
  manager_id: string | null;
}
