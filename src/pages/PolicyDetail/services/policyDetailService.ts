import { supabase } from '../../../lib/supabase';
import type { PolicyWithRelations } from '../types';
import { changePolicyStatus, deletePolicySafe } from '../../Policies/services/policiesService';
import { dalRead } from '../../../lib/dataAccessLayer';

// ملحوظة: تحميل/سداد/إلغاء سداد الأقساط أصبح مركزياً بالكامل فى
// src/features/installments/installmentsService.ts (مصدر واحد يُستخدم هنا
// وفى صفحة التحصيل والسداد وصفحة العملاء)، بدلاً من تكرارها فى كل صفحة.
//
// نفس الأمر هنا: تغيير حالة الوثيقة وحذفها بأمان أصبحا مُعرَّفين مرة واحدة
// فقط فى src/pages/Policies/services/policiesService.ts ومُعاد تصديرهما هنا
// بدل تكرار نفس المنطق فى الصفحتين.
export { changePolicyStatus, deletePolicySafe };

export async function fetchPolicyById(id: string): Promise<PolicyWithRelations> {
  const result = await dalRead(
    `policyDetail:byId:${id}`,
    async () => {
      const { data, error } = await supabase
        .from('policies')
        .select(`
          *,
          customer:customer_id(id, name, phone, national_id),
          owner:owner_id(id, name)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      return data as PolicyWithRelations;
    },
    { emptyValue: {} as PolicyWithRelations },
  );
  return result.data;
}

// نستخدم دالة can_delete_policy الموجودة بالفعل فى قاعدة البيانات (نفس
// الفحص المستخدم داخل delete_policy_safe نفسها) بدل تكرار استعلامى
// installments/payments يدوياً هنا.
export async function checkPolicyDeletable(policyId: string): Promise<boolean> {
  const result = await dalRead(
    `policyDetail:deletable:${policyId}`,
    async () => {
      const { data, error } = await supabase.rpc('can_delete_policy', { p_policy_id: policyId });
      if (error) throw error;
      return !!data;
    },
    { emptyValue: false },
  );
  return result.data;
}
