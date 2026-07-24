import type { UserRole } from './supabase';

// ===================================
// إخفاء "الفرع الرئيسي" عن أي حد غير Super Admin.
//
// تصحيح مهم (schema drift مكتشف عند مزامنة الريبو مع قاعدة البيانات
// الفعلية): "الفرع الرئيسي" كان بيتحدد سابقًا بأقدم فرع (created_at
// الأصغر)، لكن هذا المعيار بقى غلط منذ migration 058_add_headquarters_branch
// اللي ضافت عمود branches.is_headquarters صريح (مع unique partial index
// يضمن فرع واحد بس True) — وده بقى المعيار الحقيقي الوحيد المستخدم فعليًا
// فى قاعدة البيانات (دالة sync_primary_branch_role وباقي RLS policies).
// فى بيانات الإنتاج الحالية، "الفرع الرئيسي" (is_headquarters = true) اتعمل
// بعد فرع تشغيلي حقيقي تاني (اللي بقى اسمه "فرع طنطا 3") — يعني معيار
// "أقدم فرع" القديم كان بالفعل بيخفي الفرع الغلط تمامًا (فرع طنطا 3 نفسه)
// ويسيب "الفرع الرئيسي" ظاهر للكل. تم تصحيح المعيار هنا ليعتمد على
// is_headquarters مباشرة، مطابقة تمامًا لمعيار RLS على مستوى قاعدة البيانات
// (migration 059_hide_main_branch_rls).
//
// هذا إخفاء على مستوى الواجهة (UI-level) بالإضافة لطبقة الـ RLS (059) اللي
// بتمنع القراءة المباشرة لغير super_admin حتى بدون المرور بالواجهة.
// ===================================

/** بتاخد قائمة Branch[] (فيها is_headquarters مباشرة) — تُستخدم فى شاشة إدارة الفروع. */
export function filterVisibleBranches<T extends { is_headquarters: boolean }>(
  branches: T[],
  viewerRole: UserRole | undefined,
): T[] {
  if (viewerRole === 'super_admin') return branches;
  return branches.filter((b) => !b.is_headquarters);
}

/** بتاخد قائمة "أوضاع وظيفية" (isHeadquarters) — تُستخدم فى سلكتور الفرع بالهيدر. */
export function filterVisibleMemberships<T extends { isHeadquarters: boolean }>(
  memberships: T[],
  viewerRole: UserRole | undefined,
): T[] {
  if (viewerRole === 'super_admin') return memberships;
  return memberships.filter((m) => !m.isHeadquarters);
}
