import type { UserRole } from '../../lib/supabase';

// المرحلة الأولى من دعم "تعدد الفروع" — هذه الأنواع تعكس جدولي branches
// و user_branch_roles (migration 052/053) واللي لسه مستخدمة بس من شاشة
// الإدارة الجديدة، بدون أي تأثير على باقي التطبيق.

export interface Branch {
  id: string;
  name: string;
  is_active: boolean;
  // "الفرع الرئيسي" (مقر السوبر أدمن فقط) — راجع migration 058_add_headquarters_branch.
  // هذا هو المعيار الفعلي المعتمد فى قاعدة البيانات لتمييزه، مش ترتيبه الزمني.
  is_headquarters: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserBranchRole {
  id: string;
  user_id: string;
  branch_id: string;
  role: UserRole;
  manager_id: string | null;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

// صف موسّع للعرض فى شاشة الإدارة — بيانات المستخدم/المدير/الفرع مدموجة
// عن طريق join وقت القراءة (select مع علاقات Supabase)، فقط للعرض.
export interface UserBranchRoleRow extends UserBranchRole {
  user: { id: string; name: string; role: UserRole } | null;
  manager: { id: string; name: string } | null;
  branch: { id: string; name: string; is_headquarters: boolean } | null;
}

export interface UserLookupRow {
  id: string;
  name: string;
  role: UserRole;
}
