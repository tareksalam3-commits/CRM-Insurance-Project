import { z } from 'zod';

export const policySchema = z.object({
  policy_number: z.string().min(1, 'رقم الوثيقة مطلوب'),
  customer_id: z.string().min(1, 'العميل مطلوب'),
  policy_type: z.enum(['quadruple', 'protection_investment', 'mixed', 'installments', 'pension_peace']),
  start_date: z.string().min(1, 'تاريخ البداية مطلوب'),
  payment_method: z.enum(['monthly', 'quarterly', 'semi_annual', 'annual']),
  premium_amount: z.number().min(1, 'قيمة القسط مطلوبة'),
  notes: z.string().optional()
});

export type PolicyFormData = z.infer<typeof policySchema>;
