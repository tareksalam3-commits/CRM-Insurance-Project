import { supabase } from './supabase';
import { dalRead } from './dataAccessLayer';
import type { UserRole } from './supabase';

// ===================================
// المرحلة الثانية من دعم "تعدد الفروع" — Helper واحد على مستوى التطبيق:
// "كل الفروع اللي المستخدم الحالي عضو فيها" (من user_branch_roles).
//
// الغالبية العظمى من المستخدمين عندهم صف واحد بس (وضع وظيفي واحد، فى
// الفرع الافتراضي اللي انعمله backfill فى migration 053) — الهدف من هذا
// الملف إنه يبقى المصدر الوحيد اللي أي جزء فى الواجهة (هيدر، صفحة، إلخ)
// بيسأله "هل المستخدم ده عنده أكتر من فرع؟ ولو لا، هو فى أنهي فرع؟"
// بدل ما كل صفحة تكرر نفس منطق القراءة من user_branch_roles.
//
// هذا الملف قراءة بس (read-only) ومفيهوش أي state مشترك بين المكونات —
// الـ state المشترك (الفرع "الحالي" المختار + الحفظ فى الـ session) موجود
// فى src/lib/branchContext.tsx اللي بيستخدم الهيلبر ده تحته.
// ===================================

export interface MyBranchMembership {
  branchId: string;
  branchName: string;
  branchCreatedAt: string;
  // "الفرع الرئيسي" (مقر السوبر أدمن) — من عمود branches.is_headquarters
  // الفعلي (migration 058_add_headquarters_branch)، مش من الترتيب الزمني.
  isHeadquarters: boolean;
  role: UserRole;
  isPrimary: boolean;
}

/**
 * يرجع كل الفروع اللي المستخدم (userId) عضو فيها حاليًا (فروع مفعّلة بس)،
 * مرتبة بحيث الفرع الأساسي (is_primary) الأول.
 *
 * - مستخدم عادي (وضع وظيفي واحد بس): المصفوفة المرجعة هتحتوي على عنصر واحد
 *   بالظبط — الفرع الافتراضي/الأساسي بتاعه، بدون أي حاجة لعرض أي اختيار
 *   فى الواجهة.
 * - مدير عنده أكتر من وضع وظيفي: المصفوفة هترجع كل الفروع، عشان الواجهة
 *   (سلكتور الفرع) تقدر تعرضهم كخيارات.
 */
export async function fetchMyBranches(userId: string): Promise<MyBranchMembership[]> {
  const result = await dalRead(
    `myBranches:${userId}`,
    async () => {
      const { data, error } = await supabase
        .from('user_branch_roles')
        .select('branch_id, role, is_primary, branch:branch_id(id, name, is_active, created_at, is_headquarters)')
        .eq('user_id', userId);
      if (error) throw error;

      const rows = (data || []) as unknown as Array<{
        branch_id: string;
        role: UserRole;
        is_primary: boolean;
        branch: { id: string; name: string; is_active: boolean; created_at: string; is_headquarters: boolean } | null;
      }>;

      return rows
        .filter((r) => r.branch?.is_active !== false) // نتجاهل الفروع المعطّلة
        .map((r) => ({
          branchId: r.branch_id,
          branchName: r.branch?.name ?? '',
          branchCreatedAt: r.branch?.created_at ?? new Date(0).toISOString(),
          isHeadquarters: r.branch?.is_headquarters ?? false,
          role: r.role,
          isPrimary: r.is_primary,
        }))
        .sort((a, b) => (a.isPrimary === b.isPrimary ? 0 : a.isPrimary ? -1 : 1));
    },
    { emptyValue: [] as MyBranchMembership[] },
  );
  return result.data;
}

/**
 * اختصار شائع: لو المستخدم عضو فى فرع واحد بس (الحالة الطبيعية لغالبية
 * المستخدمين)، يرجع الـ id بتاعه مباشرة بدون أي احتياج لعرض اختيار.
 * لو عنده أكتر من فرع، يرجع null (الاختيار وقتها من مسؤولية الواجهة/
 * BranchProvider اللي بيحفظ اختيار المستخدم فى الـ session).
 */
export function getSoleBranchId(branches: MyBranchMembership[]): string | null {
  return branches.length === 1 ? branches[0].branchId : null;
}
