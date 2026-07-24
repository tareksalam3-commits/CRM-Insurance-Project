import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import type { UserRole } from '../lib/supabase';

type RequireRoleProps = {
  /** دالة تحدد هل الدور الحالي مسموح له بالوصول للصفحة أم لا */
  check: (role: UserRole) => boolean;
  children: ReactNode;
};

/**
 * حماية على مستوى الـ Route: لو دور المستخدم الحالي مش مطابق لشرط الصلاحية
 * (check)، بيتم تحويله تلقائياً للصفحة الرئيسية بدل ما يقدر يوصل للصفحة عن
 * طريق كتابة الرابط مباشرة فى المتصفح. ده مكمل لإخفاء الروابط من الـ Sidebar
 * (config/navigation.ts) مش بديل عنه — الاتنين مطلوبين مع بعض.
 */
export function RequireRole({ check, children }: RequireRoleProps) {
  const { user } = useAuth();

  // لو مفيش مستخدم لسه (حالة نظرية هنا لأن AppLayout بيتأكد قبلها)، أو
  // الدور مش مسموح له، نرجّعه للرئيسية بدل ما نسيبه يشوف محتوى الصفحة.
  if (!user || !check(user.role)) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}
