import { z } from 'zod';

export const profileSchema = z.object({
  name: z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل'),
  phone: z.string().optional(),
  registration_number: z.string().optional(),
});

export const passwordSchema = z.object({
  currentPassword: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
  newPassword: z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
  confirmPassword: z.string()
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'كلمات المرور غير متطابقة',
  path: ['confirmPassword']
});

export type ProfileFormData = z.infer<typeof profileSchema>;
export type PasswordFormData = z.infer<typeof passwordSchema>;

export interface StatusMessage {
  type: 'success' | 'error';
  text: string;
}

// كل الحقول هنا أرقام محسوبة لحظيًا من قاعدة البيانات، لا تُخزَّن في أي جدول
export interface ProfilePerformanceStats {
  yearTotalPaid: number;
  monthTotalPaid: number;
  policiesThisYearCount: number;
  activeCustomersCount: number;
  commissionsThisMonth: number;
}
