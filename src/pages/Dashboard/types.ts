import type { UserRole } from '../../lib/supabase';

export interface DashboardStats {
  totalCustomers: number;
  totalPolicies: number;
  activePolicies: number;
  cancelledPolicies: number;
  newProduction: number;
  newProductionCount: number;
  // إجمالي أقساط الإنتاج الجديد المستحقة هذا الشهر (المسدد منها + المتبقي)،
  // تُستخدم لعرض "المسدد X من إجمالي Y" في بطاقة الإنتاج الجديد
  newProductionTotal: number;
  periodicCollection: number;
  periodicCollectionCount: number;
  // إجمالي أقساط التحصيل الدوري المستحقة هذا الشهر (المسدد منها + المتبقي)،
  // تُستخدم لعرض "المسدد X من إجمالي Y" في بطاقة التحصيل الدوري
  periodicCollectionTotal: number;
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

// تفاصيل أداء عضو واحد من الفريق (تُستخدم في الـ Bottom Sheet التفاعلي عند
// الضغط على اسم داخل بطاقة "أداء الفريق"). نفس الهدف الواحد المستخدم بالفعل
// في TeamPerformance أعلاه، لكن مقسّم إلى مصدريه (إنتاج جديد / تحصيل) دون
// إنشاء أي هدف جديد أو منطق حساب مختلف.
export interface TeamMemberDetail {
  id: string;
  name: string;
  role: UserRole;
  managerId: string | null;
  target: number;
  newProduction: number;
  collection: number;
  achieved: number;
  remaining: number;
  rate: number;
  // المتبقي (غير المسدد) من مستحقات هذا الشهر، مقسّم حسب المصدر — إنتاج
  // جديد / تحصيل دوري — لنفس فريق هذا الشخص (تجميع من الأسفل للأعلى مثل
  // newProduction/collection أعلاه). يُحسب من أقساط هذا الشهر التي لم
  // تُسدد بعد (pending/overdue)، وليس له علاقة بـ "الهدف" (target).
  remainingNewProduction: number;
  remainingCollection: number;
}
