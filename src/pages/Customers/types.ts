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
  // بيانات "طلب التأمين": إلزامية فقط عند إضافة عميل جديد (isEditingCustomer
  // = false). العملاء الموجودين حالياً قد لا يملكون هذه البيانات، فتفضل
  // اختيارية عند التعديل حتى لا يُمنع حفظ تعديل بسيط على عميل قديم —
  // isEditingCustomer بيتحكم في الإلزامية عبر superRefine تحت (نفس أسلوب
  // isManagerRole فوق، ونفس أسلوب isEditingPolicy فى Policies/types.ts).
  insurance_amount: z.number().optional(),
  payment_method: z.enum(['monthly', 'quarterly', 'semi_annual', 'annual']).optional(),
  deposit_amount: z.number().optional(),
  isManagerRole: z.boolean().optional(),
  isEditingCustomer: z.boolean().optional()
}).superRefine((data, ctx) => {
  if (data.isManagerRole && !data.owner_id) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'يجب اختيار الوكيل المسؤول',
      path: ['owner_id']
    });
  }

  if (!data.isEditingCustomer) {
    if (data.insurance_amount === undefined || data.insurance_amount === null || Number.isNaN(data.insurance_amount)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'مبلغ التأمين مطلوب',
        path: ['insurance_amount']
      });
    }
    if (!data.payment_method) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'طريقة السداد مطلوبة',
        path: ['payment_method']
      });
    }
    if (data.deposit_amount === undefined || data.deposit_amount === null || Number.isNaN(data.deposit_amount)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'العربون مطلوب',
        path: ['deposit_amount']
      });
    }
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
