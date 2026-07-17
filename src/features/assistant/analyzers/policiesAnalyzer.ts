import { supabase, User } from '../../../lib/supabase';
import { dalRead } from '../../../lib/dataAccessLayer';
import type { AssistantAnswer } from '../types';
import { getScopedUserIds } from '../helpers/scopeHelpers';

/** عدد الوثائق (الإجمالي الكلي، وليس فقط وثائق اليوم) */
export async function getDocumentsCount(user: User): Promise<AssistantAnswer> {
  const userIds = await getScopedUserIds(user);

  const result = await dalRead(
    `assistant:documentsCount:${userIds.slice().sort().join(',')}`,
    async () => {
      const { count, error } = await supabase
        .from('policies')
        .select('id', { count: 'exact', head: true })
        .in('owner_id', userIds);
      if (error) throw error;
      return count ?? 0;
    },
    { emptyValue: 0 },
  );

  return {
    title: '📄 عدد الوثائق',
    lines: [`إجمالي عدد الوثائق: ${result.data}`]
  };
}
