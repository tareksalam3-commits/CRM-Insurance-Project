import type { UserRole } from '../../lib/supabase';

// ─── types ────────────────────────────────────────────────
// بيانات خفيفة فقط (بدون أرقام مالية) — كافية لرسم الهيكل والبحث والإحصائيات
// من غير ما نحمّل بيانات الإنتاج لكل الشركة من البداية
export interface RosterUser {
  id: string;
  name: string;
  role: UserRole;
  manager_id: string | null;
  is_active: boolean;
  avatar_url: string | null;
  target: number;
}
