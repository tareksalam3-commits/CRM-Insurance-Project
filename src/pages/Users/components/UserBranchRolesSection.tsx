import { useEffect, useMemo, useState } from 'react';
import { Loader2, Plus, Trash2, Pencil, Check, X as XIcon, Star } from 'lucide-react';
import clsx from 'clsx';
import { ROLE_LABELS, type UserRole } from '../../../lib/supabase';
import { useAuth } from '../../../hooks/useAuth';
import { filterVisibleBranches } from '../../../lib/branchVisibility';
import {
  fetchBranches, fetchUserBranchRolesForUser, addUserBranchRole,
  updateUserBranchRole, deleteUserBranchRole,
} from '../../../features/branches/services/branchesService';
import type { Branch, UserBranchRoleRow } from '../../../features/branches/types';

// كل الأدوار — تُستخدم فى تعديل صف موجود بالفعل: لو المستخدم عنده وضع وظيفي
// واحد بس، الصف ده هو وضعه الأساسي، وممكن يكون "وكيل"/"وكيل بريميوم" شرعًا
// (مش وضع إضافي)، فمينفعش نستثنيهم هنا زي شاشة "إضافة وضع جديد".
const ALL_ROLE_OPTIONS = Object.keys(ROLE_LABELS) as UserRole[];

// الوكيل ووكيل بريميوم مقتصرون على فرع واحد فقط (migration 057) — بنستثنيهم
// فقط من قائمة "إضافة وضع جديد" (ADD_ROLE_OPTIONS)، لأن أي وضع يُضاف من هنا
// معناه أكيد إن المستخدم هيبقى له أكتر من فرع، وهو بالظبط الممنوع على
// الوكيل/وكيل بريميوم. نفس القيد المطبّق فى AddExtraRoleModal.tsx.
const ADD_ROLE_OPTIONS = ALL_ROLE_OPTIONS.filter(
  (r) => r !== 'agent' && r !== 'premium_agent'
);

// قسم "الأوضاع الوظيفية" — يحل محل شاشة الإدارة المؤقتة اللي كانت فى
// features/branches/pages/BranchesAdminPage.tsx (المرحلة الأولى): بيعرض كل
// صفوف هذا المستخدم بالذات فى user_branch_roles، ويسمح بإضافة/تعديل/حذف
// وضع مباشرة من نفس شاشة تعديل المستخدم. الوضع الأساسي (is_primary) بيفضل
// دايمًا مطابق لـ users.role/users.manager_id عبر نفس الـ triggers الموجودة
// فعلاً فى قاعدة البيانات (migration 052) — القسم ده بيدير الأوضاع
// الإضافية بشكل رئيسي، لكن بيسمح بعرض/تعديل الكل لو احتاج الأمر.
export function UserBranchRolesSection({ userId }: { userId: string }) {
  const { user: viewer } = useAuth();
  const [loading, setLoading] = useState(true);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [roles, setRoles] = useState<UserBranchRoleRow[]>([]);

  const [showAdd, setShowAdd] = useState(false);
  const [newBranchId, setNewBranchId] = useState('');
  const [newRole, setNewRole] = useState<UserRole>(ADD_ROLE_OPTIONS[0]);
  const [newManagerId, setNewManagerId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRole, setEditRole] = useState<UserRole>(ALL_ROLE_OPTIONS[0]);
  const [editManagerId, setEditManagerId] = useState('');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const [b, r] = await Promise.all([fetchBranches(), fetchUserBranchRolesForUser(userId)]);
      // إخفاء "الفرع الرئيسي" عن أي حد بيعدّل غير سوبر أدمن، حتى من قائمة
      // "إضافة وضع جديد" هنا.
      setBranches(filterVisibleBranches(b, viewer?.role));
      setRoles(r);
    } catch (err) {
      console.error('Error loading user branch roles:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [userId]);

  // المديرين المتاحين للاختيار فى الفرع الجديد: أي مستخدم عنده أصلاً صف فى
  // نفس الفرع غير المستخدم الحالي نفسه (نفس شرط الـ constraint trigger).
  const [branchMembers, setBranchMembers] = useState<UserBranchRoleRow[]>([]);
  useEffect(() => {
    if (!newBranchId) { setBranchMembers([]); return; }
    import('../../../features/branches/services/branchesService').then(({ fetchUserBranchRoles }) => {
      fetchUserBranchRoles().then((all) => {
        setBranchMembers(all.filter((r) => r.branch_id === newBranchId && r.user_id !== userId));
      });
    });
  }, [newBranchId, userId]);

  const availableBranchesForNewRole = useMemo(
    () => branches.filter((b) => !roles.some((r) => r.branch_id === b.id)),
    [branches, roles],
  );

  const handleAdd = async () => {
    if (!newBranchId) { setError('اختر الفرع'); return; }
    setError(null);
    setSaving(true);
    try {
      await addUserBranchRole({
        userId, branchId: newBranchId, role: newRole,
        managerId: newManagerId || null, isPrimary: roles.length === 0,
      });
      setShowAdd(false);
      setNewBranchId(''); setNewManagerId(''); setNewRole(ADD_ROLE_OPTIONS[0]);
      await load();
    } catch (err: any) {
      setError(err?.code === '23505' ? 'هذا المستخدم لديه بالفعل وضع فى هذا الفرع' : err?.message || 'حدث خطأ أثناء الإضافة');
    } finally {
      setSaving(false);
    }
  };

  const startEdit = (r: UserBranchRoleRow) => {
    setEditingId(r.id);
    setEditRole(r.role);
    setEditManagerId(r.manager_id || '');
  };

  const handleSaveEdit = async (r: UserBranchRoleRow) => {
    setSaving(true);
    try {
      await updateUserBranchRole(r.id, { role: editRole, managerId: editManagerId || null });
      setEditingId(null);
      await load();
    } catch (err) {
      console.error('Error updating user branch role:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    try {
      await deleteUserBranchRole(id);
      await load();
    } catch (err) {
      console.error('Error deleting user branch role:', err);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <div className="form-group border-t border-secondary-200 pt-4">
      <div className="flex items-center justify-between mb-2">
        <label className="input-label mb-0">الأوضاع الوظيفية (الفروع)</label>
        <button
          type="button"
          onClick={() => setShowAdd((s) => !s)}
          className="btn btn-ghost btn-sm text-primary-600"
        >
          <Plus className="w-4 h-4" />
          <span>إضافة وضع</span>
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-4">
          <Loader2 className="w-5 h-5 animate-spin text-secondary-400" />
        </div>
      ) : (
        <div className="space-y-2">
          {roles.length === 0 && (
            <p className="text-xs text-secondary-400 py-2">لا توجد أوضاع وظيفية مسجّلة بعد</p>
          )}
          {roles.map((r) => (
            <div key={r.id} className="flex items-center justify-between gap-2 p-2.5 rounded-lg border border-secondary-200 bg-secondary-50/50">
              {editingId === r.id ? (
                <div className="flex-1 grid grid-cols-2 gap-2">
                  <select value={editRole} onChange={(e) => setEditRole(e.target.value as UserRole)} className="input-field text-sm py-1">
                    {/* لو ده وضعه الوحيد، ممكن يفضل وكيل/وكيل بريميوم عادي. لو
                        عنده أكتر من وضع، لازم نمنع وكيل/وكيل بريميوم هنا كمان
                        (نفس قيد migration 057) عشان مايترفضش من السيرفر. */}
                    {(roles.length > 1 ? ADD_ROLE_OPTIONS : ALL_ROLE_OPTIONS).map((ro) => (
                      <option key={ro} value={ro}>{ROLE_LABELS[ro]}</option>
                    ))}
                  </select>
                  <select value={editManagerId} onChange={(e) => setEditManagerId(e.target.value)} className="input-field text-sm py-1">
                    <option value="">بدون مدير</option>
                    {roles.filter((x) => x.branch_id === r.branch_id && x.id !== r.id).map((x) => (
                      <option key={x.id} value={x.user_id}>{x.user?.name}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <div className="min-w-0">
                  <p className="text-sm font-medium text-secondary-900 flex items-center gap-1.5">
                    {r.branch?.name}
                    {r.is_primary && <Star className="w-3.5 h-3.5 text-warning-500 fill-warning-500" />}
                  </p>
                  <p className="text-xs text-secondary-500">
                    {ROLE_LABELS[r.role]}
                    {r.manager?.name ? ` · المدير: ${r.manager.name}` : ''}
                  </p>
                </div>
              )}

              <div className="flex items-center gap-1 flex-shrink-0">
                {editingId === r.id ? (
                  <>
                    <button type="button" onClick={() => handleSaveEdit(r)} disabled={saving} className="p-1.5 rounded-lg hover:bg-success-100 text-success-700">
                      <Check className="w-4 h-4" />
                    </button>
                    <button type="button" onClick={() => setEditingId(null)} className="p-1.5 rounded-lg hover:bg-secondary-100 text-secondary-500">
                      <XIcon className="w-4 h-4" />
                    </button>
                  </>
                ) : (
                  <>
                    <button type="button" onClick={() => startEdit(r)} className="p-1.5 rounded-lg hover:bg-secondary-100 text-secondary-600">
                      <Pencil className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDelete(r.id)}
                      disabled={deletingId === r.id || roles.length === 1}
                      title={roles.length === 1 ? 'لا يمكن حذف آخر وضع وظيفي' : undefined}
                      className={clsx('p-1.5 rounded-lg hover:bg-error-50 text-error-600', roles.length === 1 && 'opacity-40 cursor-not-allowed')}
                    >
                      {deletingId === r.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showAdd && (
        <div className="mt-3 p-3 rounded-lg border border-primary-200 bg-primary-50/40 space-y-2">
          <select value={newBranchId} onChange={(e) => { setNewBranchId(e.target.value); setNewManagerId(''); }} className="input-field text-sm">
            <option value="">اختر الفرع</option>
            {availableBranchesForNewRole.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select>
          <select value={newRole} onChange={(e) => setNewRole(e.target.value as UserRole)} className="input-field text-sm">
            {ADD_ROLE_OPTIONS.map((ro) => <option key={ro} value={ro}>{ROLE_LABELS[ro]}</option>)}
          </select>
          <select value={newManagerId} onChange={(e) => setNewManagerId(e.target.value)} className="input-field text-sm" disabled={!newBranchId}>
            <option value="">بدون مدير مباشر فى هذا الفرع</option>
            {branchMembers.map((m) => <option key={m.user_id} value={m.user_id}>{m.user?.name} — {ROLE_LABELS[m.role]}</option>)}
          </select>
          {error && <p className="text-xs text-error-600">{error}</p>}
          <div className="flex gap-2 justify-end">
            <button type="button" onClick={() => setShowAdd(false)} className="btn btn-secondary btn-sm">إلغاء</button>
            <button type="button" onClick={handleAdd} disabled={saving} className="btn btn-primary btn-sm">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : 'إضافة'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
