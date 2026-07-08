import { z } from 'zod';

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
