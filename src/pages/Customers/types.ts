import { z } from 'zod';
import type { Customer, PolicyStatus, PolicyType } from '../../lib/supabase';

export const customerSchema = z.object({
  name: z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل'),
  national_id: z.string().optional(),
  phone: z.string().optional(),
  address: z.string().optional(),
  birth_date: z.string().optional(),
  occupation: z.string().optional(),
  marital_status: z.enum(['single', 'married', 'divorced', 'widowed']).optional(),
  owner_id: z.string().optional(),
  isManagerRole: z.boolean().optional()
}).superRefine((data, ctx) => {
  if (data.isManagerRole && !data.owner_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'يجب اختيار الوكيل المسؤول',
      path: ['owner_id']
    });
  }
});

export type CustomerFormData = z.infer<typeof customerSchema>;

// ملخص وثيقة مرتبطة بالعميل — للعرض فقط داخل بطاقة/تفاصيل العميل، بدون أي
// تأثير على منطق أو جدول الوثائق نفسه
export type CustomerPolicySummary = {
  id: string;
  policy_number: string;
  policy_type: PolicyType;
  premium_amount: number;
  sum_assured?: number | null;
  start_date: string;
  status: PolicyStatus;
  created_at: string;
};

// شكل بيانات العميل بعد ضمّ اسم الوكيل ووثائقه — تُستخدم فقط لعرض القائمة
// والبطاقات، ولا تُستخدم فى الحفظ/التعديل (النموذج يعتمد على CustomerFormData)
export type CustomerWithRelations = Customer & {
  owner?: { id: string; name: string } | null;
  policies?: CustomerPolicySummary[];
};
