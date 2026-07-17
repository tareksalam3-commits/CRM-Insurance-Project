import type { PolicyType } from '../../lib/supabase';

// وثيقة ملغاة كما ترجع من قاعدة البيانات (الحقول الخام قبل الحساب)
export interface RawCancelledPolicy {
  id: string;
  policy_number: string;
  customer_id: string;
  owner_id: string;
  policy_type: PolicyType;
  start_date: string;
  premium_amount: number;
  cancelled_at: string;
  customer?: { name: string } | null;
}

// مستخدم مبسّط (لبناء سلسلة التسلسل الإداري: وكيل ← رئيس مجموعة ← مراقب ← مراقب عام)
export interface BasicHierarchyUser {
  id: string;
  name: string;
  role: string;
  manager_id: string | null;
}

// صف تفصيلي واحد في جدول "تفاصيل الإلغاءات"
export interface CancellationDetailRow {
  policyId: string;
  customerName: string;
  policyNumberLast6: string;
  agentName: string;
  groupLeaderName: string;
  supervisorName: string;
  generalSupervisorName: string;
  startDate: string;
  cancelledDate: string;
  monthsElapsed: number;
  totalPaidBeforeCancellation: number;
  premiumAmount: number;
  policyType: PolicyType;
}

// ملخص المؤشر الكامل (نسبة + قيمة + التفاصيل)
export interface CancellationSummary {
  year: number;
  cancellationRate: number; // نسبة مئوية، مثال: 4.25
  cancelledValue: number;   // البسط: إجمالي الأقساط المسددة للوثائق التي دخلت الحساب
  totalCollected: number;   // المقام: إجمالي الأقساط المسددة لكل الوثائق هذا العام حتى الآن
  rows: CancellationDetailRow[];
}
