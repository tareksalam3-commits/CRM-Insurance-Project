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
  // لو الصف ده بيمثل حد درجته الوظيفية الحقيقية أقل من اللي المفروض يكون
  // فى نفس مستوى الصف ده (مثلاً وكيل ظاهر فى عمود "رئيس المجموعة" لأنه تابع
  // مراقب مباشرة من غير رئيس مجموعة بينهم) — بنوضح تصنيفه الحقيقي هنا عشان
  // يبان واضح إنه اتحط جنب ناس أعلى منه فى الدرجة الوظيفية وليه.
  roleNote?: string;
}

export interface SupervisorAgg {
  id: string;
  name: string;
  // الدرجة الوظيفية الحقيقية لصاحب هذا الصف — بتُستخدم فى التقرير المطبوع
  // لعرض المسمى الوظيفي الصحيح (مراقب / مراقب عام / مدير تطوير...) بدل ما
  // يتثبت على "المراقب" دايمًا.
  role: UserRole;
  groupLeaders: GroupLeaderAgg[];
  production: number;
  collection: number;
  total: number;
  // true لو الصف ده بيمثل تجميع المستخدم المسجّل دخوله نفسه (مثلاً رئيس
  // مجموعة بيشوف صفحة تجميعاته الشخصية) — فبالتالي مفيش داعي نكرر اسمه
  // كعنوان "المراقب" فوق الجدول، لأنه ظاهر أصلاً في ترويسة الصفحة.
  isSelfReport?: boolean;
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
