import type { Policy } from '../../lib/supabase';

// ===================================
// أنواع البيانات
// ===================================
export type PolicyWithRelations = Policy & {
  customer: { id: string; name: string; phone?: string; national_id?: string };
  owner: { id: string; name: string };
};
