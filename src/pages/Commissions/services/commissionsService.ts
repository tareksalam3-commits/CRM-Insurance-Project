import { supabase } from '../../../lib/supabase';
import { format, startOfMonth, subMonths } from 'date-fns';

// عدد أقساط السنة الأولى حسب طريقة السداد — تُستخدم لتوزيع عمولة السنة
// الأولى (2.4% من مبلغ التأمين) على الأقساط
export const INSTALLMENTS_PER_METHOD: Record<string, number> = {
  monthly: 12,
  quarterly: 4,
  semi_annual: 2,
  annual: 1,
};

export interface RawYear1Payment {
  id: string;
  amount: number;
  paid_at: string;
  installment: {
    policy: {
      id: string;
      policy_number: string;
      payment_method: string;
      sum_assured: number | null;
      owner_id: string;
      customer: { name: string } | null;
    } | null;
  } | null;
}

export interface RawYear2Payment {
  id: string;
  amount: number;
  payment_date: string;
  policy: {
    id: string;
    policy_number: string;
    owner_id: string;
    customer: { name: string } | null;
  } | null;
}

// جلب بيانات السداد الخام (سنة أولى + تجديد) الخاصة بمستخدم معين فقط
// (الوثائق التي هو مالكها/أصدرها owner_id)، ضمن نطاق يغطي الشهر المختار
// والشهر السابق له مباشرة — لأن استحقاق العمولة قد يقع في الشهر التالي
// لشهر السداد الفعلي (قاعدة يوم 5 / يوم 20).
// هذه القراءة فقط ولا تُعدّل أي جدول، ولا تؤثر على أي منطق آخر بالنظام.
export async function fetchCommissionSourceData(
  ownerId: string,
  selectedMonthDate: Date
): Promise<{ year1Payments: RawYear1Payment[]; year2Payments: RawYear2Payment[] }> {
  const rangeStartMonth = format(startOfMonth(subMonths(selectedMonthDate, 1)), 'yyyy-MM-dd');
  const rangeEndMonth = format(startOfMonth(selectedMonthDate), 'yyyy-MM-dd');

  const [year1Res, year2Res] = await Promise.all([
    supabase
      .from('payments')
      .select(`
        id, amount, paid_at,
        installment:installment_id(
          policy:policy_id(
            id, policy_number, payment_method, sum_assured, owner_id,
            customer:customer_id(name)
          )
        )
      `)
      .eq('is_cancelled', false)
      .gte('payment_month', rangeStartMonth)
      .lte('payment_month', rangeEndMonth),
    supabase
      .from('year2_payments')
      .select(`
        id, amount, payment_date,
        policy:policy_id(
          id, policy_number, owner_id,
          customer:customer_id(name)
        )
      `)
      .eq('is_cancelled', false)
      .gte('payment_month', rangeStartMonth)
      .lte('payment_month', rangeEndMonth),
  ]);

  if (year1Res.error) throw year1Res.error;
  if (year2Res.error) throw year2Res.error;

  const year1Payments = ((year1Res.data || []) as unknown as RawYear1Payment[]).filter(
    (p) => p.installment?.policy?.owner_id === ownerId
  );

  const year2Payments = ((year2Res.data || []) as unknown as RawYear2Payment[]).filter(
    (p) => p.policy?.owner_id === ownerId
  );

  return { year1Payments, year2Payments };
}
