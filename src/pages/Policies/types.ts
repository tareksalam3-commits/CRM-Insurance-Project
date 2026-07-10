import { z } from 'zod';

export const policySchema = z.object({
  policy_number: z.string().min(1, 'رقم الوثيقة مطلوب'),
  customer_id: z.string().min(1, 'العميل مطلوب'),
  policy_type: z.enum(['quadruple', 'protection_investment', 'mixed', 'installments', 'pension_peace']),
  start_date: z.string().min(1, 'تاريخ البداية مطلوب'),
  payment_method: z.enum(['monthly', 'quarterly', 'semi_annual', 'annual']),
  premium_amount: z.number().min(1, 'قيمة القسط مطلوبة'),
  // مبلغ التأمين: إلزامي فقط عند إصدار وثيقة جديدة (isEditingPolicy = false).
  // الوثائق الموجودة حالياً قد لا تحتوي على هذا الحقل، فبيبقى فارغاً حتى
  // يتم إدخاله عند التعديل — isEditingPolicy بيتحكم في الإلزامية عبر
  // superRefine تحت (نفس أسلوب isManagerRole في customerSchema).
  sum_assured: z.number().optional(),
  notes: z.string().optional(),
  isEditingPolicy: z.boolean().optional()
}).superRefine((data, ctx) => {
  if (!data.isEditingPolicy && (data.sum_assured === undefined || data.sum_assured === null || Number.isNaN(data.sum_assured))) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'مبلغ التأمين مطلوب',
      path: ['sum_assured']
    });
  }
});

export type PolicyFormData = z.infer<typeof policySchema>;
