import { useMemo, useState } from 'react';
import { X, Loader2 } from 'lucide-react';
import { ROLE_LABELS, type UserRole } from '../../../lib/supabase';
import { addUserBranchRole } from '../services/branchesService';
import type { Branch, UserBranchRoleRow, UserLookupRow } from '../types';

// الوكيل ووكيل بريميوم مقتصرون على فرع واحد فقط (migration 057) — تعدد
// الفروع متاح فقط من رئيس مجموعة فما فوق، فبنشيلهم من قائمة الأدوار هنا
// لتفادي رفض السيرفر لهم لاحقًا.
const ROLE_OPTIONS = (Object.keys(ROLE_LABELS) as UserRole[]).filter(
  (r) => r !== 'agent' && r !== 'premium_agent'
);

// إضافة "وضع وظيفي إضافي" لمستخدم موجود فى فرع تاني: اختيار الفرع + الدور +
// المدير المباشر بتاعه فى هذا الفرع بالذات. المدير المتاح للاختيار لازم يكون
// أصلاً ليه صف فى نفس الفرع (بنفس شرط الـ constraint trigger فى قاعدة
// البيانات — راجع migration 052)، فبنفلتر القائمة على هذا الأساس فى الواجهة
// كمان لتفادي محاولة حفظ تضارب هيرجعه السيرفر أصلاً كخطأ.
export function AddExtraRoleModal({
  users, branches, existingRoles, onClose, onDone,
}: {
  users: UserLookupRow[];
  branches: Branch[];
  existingRoles: UserBranchRoleRow[];
  onClose: () => void;
  onDone: () => void;
}) {
  const [userId, setUserId] = useState('');
  const [branchId, setBranchId] = useState('');
  const [role, setRole] = useState<UserRole>(ROLE_OPTIONS[0]);
  const [managerId, setManagerId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const availableManagers = useMemo(() => {
    if (!branchId) return [];
    return existingRoles.filter((r) => r.branch_id === branchId && r.user_id !== userId);
  }, [existingRoles, branchId, userId]);

  const alreadyAssigned = useMemo(() => {
    if (!userId || !branchId) return false;
    return existingRoles.some((r) => r.user_id === userId && r.branch_id === branchId);
  }, [existingRoles, userId, branchId]);

  const handleSave = async () => {
    if (!userId || !branchId) {
      setError('اختر المستخدم والفرع');
      return;
    }
    if (alreadyAssigned) {
      setError('هذا المستخدم لديه بالفعل وضع فى هذا الفرع');
      return;
    }
    setError(null);
    setSaving(true);
    try {
      await addUserBranchRole({
        userId,
        branchId,
        role,
        managerId: managerId || null,
        isPrimary: false,
      });
      onDone();
    } catch (err: any) {
      setError(err?.code === '23505' ? 'هذا المستخدم لديه بالفعل وضع فى هذا الفرع' : err?.message || 'حدث خطأ أثناء الإضافة');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-0 sm:p-4">
      <div className="bg-white rounded-t-3xl sm:rounded-2xl w-full sm:max-w-md max-h-[92vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-secondary-100 px-5 py-4 flex items-center justify-between">
          <h3 className="font-bold text-secondary-900">إضافة وضع وظيفي إضافي</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary-100">
            <X className="w-5 h-5 text-secondary-500" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1.5">المستخدم</label>
            <select value={userId} onChange={(e) => setUserId(e.target.value)} className="input-field">
              <option value="">اختر المستخدم</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} — {ROLE_LABELS[u.role]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1.5">الفرع</label>
            <select
              value={branchId}
              onChange={(e) => { setBranchId(e.target.value); setManagerId(''); }}
              className="input-field"
            >
              <option value="">اختر الفرع</option>
              {branches.filter((b) => b.is_active).map((b) => (
                <option key={b.id} value={b.id}>{b.name}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1.5">الدور فى هذا الفرع</label>
            <select value={role} onChange={(e) => setRole(e.target.value as UserRole)} className="input-field">
              {ROLE_OPTIONS.map((r) => (
                <option key={r} value={r}>{ROLE_LABELS[r]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-secondary-700 mb-1.5">المدير المباشر فى هذا الفرع (اختياري)</label>
            <select
              value={managerId}
              onChange={(e) => setManagerId(e.target.value)}
              className="input-field"
              disabled={!branchId}
            >
              <option value="">بدون مدير مباشر</option>
              {availableManagers.map((r) => (
                <option key={r.user_id} value={r.user_id}>
                  {r.user?.name} — {ROLE_LABELS[r.role]}
                </option>
              ))}
            </select>
            {branchId && availableManagers.length === 0 && (
              <p className="text-xs text-secondary-400 mt-1">لا يوجد مستخدمين آخرين مسجّلين فى هذا الفرع بعد</p>
            )}
          </div>

          {error && <p className="text-sm text-error-600">{error}</p>}
        </div>

        <div className="sticky bottom-0 bg-white border-t border-secondary-100 px-5 py-4 flex gap-2">
          <button onClick={onClose} className="btn btn-secondary flex-1 justify-center" disabled={saving}>
            إلغاء
          </button>
          <button onClick={handleSave} className="btn btn-primary flex-1 justify-center" disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إضافة'}
          </button>
        </div>
      </div>
    </div>
  );
}
