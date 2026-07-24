import { supabase, User } from '../../../lib/supabase';
import { startOfMonth, format } from 'date-fns';
import { dalRead } from '../../../lib/dataAccessLayer';
import type { AssistantAnswer } from '../types';
import { getScopedUserIds } from '../helpers/scopeHelpers';

/** نسبة الإلغاءات (إجمالي + هذا الشهر) */
export async function getCancellationRate(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);
  const monthStartStr = format(startOfMonth(new Date()), 'yyyy-MM-dd');

  const result = await dalRead(
    `assistant:cancellationRate:${userIds.slice().sort().join(',')}`,
    async () => {
      const { data, error } = await supabase.rpc('assistant_scoped_policies');
      if (error) throw error;
      return data || [];
    },
    { emptyValue: [] as any[] },
  );

  const policies = result.data;
  const total = policies.length;
  const cancelled = policies.filter((p: any) => p.status === 'cancelled').length;
  const cancelledThisMonth = policies.filter(
    (p: any) => p.status === 'cancelled' && p.cancelled_at && p.cancelled_at >= monthStartStr
  ).length;
  const rate = total > 0 ? Math.round((cancelled / total) * 100) : 0;

  return {
    title: '🚫 نسبة الإلغاءات',
    lines:
      total === 0
        ? ['لا توجد وثائق ضمن نطاقك حتى الآن']
        : [
            `نسبة الإلغاءات الإجمالية: ${rate}% (${cancelled} من ${total} وثيقة)`,
            `وثائق أُلغيت هذا الشهر: ${cancelledThisMonth}`
          ]
  };
}
