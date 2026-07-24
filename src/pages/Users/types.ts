import { z } from 'zod';
import type { UserRole } from '../../lib/supabase';

// ────────────────────────────────────────────────────────────
// Schemas
// ────────────────────────────────────────────────────────────
export const userSchema = z.object({
  name:       z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل'),
  email:      z.string().email('البريد الإلكتروني غير صحيح'),
  phone:      z.string().optional(),
  role:       z.enum(['super_admin', 'development_manager', 'general_supervisor', 'supervisor', 'group_leader', 'agent', 'premium_agent']),
  manager_id: z.string().optional().nullable(),
  target:     z.number().min(0).optional(),
  // مطلوب فقط لو المدير المختار له أكثر من فرع (راجع migration 056) — التحقق
  // الفعلي بيحصل فى admin-create-user، هنا مجرد نقل القيمة من الفورم.
  branch_id:  z.string().optional().nullable(),
});

export const passwordSchema = z.object({
  password:        z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
  confirmPassword: z.string().min(6, 'تأكيد كلمة المرور مطلوب'),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'كلمتا المرور غير متطابقتين',
  path: ['confirmPassword'],
});

export type UserFormData     = z.infer<typeof userSchema>;
export type PasswordFormData = z.infer<typeof passwordSchema>;

export const ROLES: UserRole[] = [
  'super_admin', 'development_manager', 'general_supervisor',
  'supervisor', 'group_leader', 'agent', 'premium_agent',
];
