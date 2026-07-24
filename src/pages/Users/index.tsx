import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useReconnectRefetch } from '../../hooks/useReconnectRefetch';
import { User, UserRole, ROLE_LABELS, canManageUsers, canResetOtherUserPassword } from '../../lib/supabase';
import { Plus, Search, Shield, X } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import clsx from 'clsx';

import { userSchema, passwordSchema, ROLES, type UserFormData, type PasswordFormData } from './types';
import { getAllowedManagers, getCreatableRoles } from './business/roleHierarchy';
import {
  fetchAllUsers, fetchUsersPage, saveUser, changeUserPassword, toggleUserActive, softDeleteUser, TEMP_PASSWORD,
} from './services/usersService';
import { fetchUserBranchRolesForUser, fetchBranches } from '../../features/branches/services/branchesService';
import type { UserBranchRoleRow, Branch } from '../../features/branches/types';
import { UsersGrid } from './components/UsersGrid';
import { UserFormModal } from './components/UserFormModal';
import { PasswordModal } from './components/PasswordModal';
import { UserDetailsModal } from './components/UserDetailsModal';
import { DeleteUserModal } from './components/DeleteUserModal';

type StatusFilter = 'all' | 'active' | 'inactive';

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all',      label: 'الكل' },
  { value: 'active',   label: 'نشط' },
  { value: 'inactive', label: 'غير نشط' },
];

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────
export function Users() {
  const { user } = useAuth();

  // ── state ──────────────────────────────────────────────
  const [users, setUsers]               = useState<User[]>([]);
  const [allUsers, setAllUsers]         = useState<User[]>([]); // for manager dropdown
  const [loading, setLoading]           = useState(true);
  // أول تحميل فقط (لسه مفيش أي بيانات) يستحق Skeleton كامل
  const isInitialLoading = loading && users.length === 0;
  const [showModal, setShowModal]       = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [editingUser, setEditingUser]   = useState<User | null>(null);
  const [saving, setSaving]             = useState(false);
  const [savingPwd, setSavingPwd]       = useState(false);
  const [page, setPage]                 = useState(1);
  const [totalPages, setTotalPages]     = useState(1);
  const [totalCount, setTotalCount]     = useState(0);
  const [searchQuery, setSearchQuery]   = useState('');
  const [localSearch, setLocalSearch]   = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [roleFilter, setRoleFilter]     = useState<UserRole | 'all'>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [branches, setBranches]         = useState<Branch[]>([]);
  const [showPwd, setShowPwd]           = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [togglingId, setTogglingId]     = useState<string | null>(null);
  const [viewingUser, setViewingUser]   = useState<User | null>(null);
  const [deletingUser, setDeletingUser] = useState<User | null>(null);
  const [deleting, setDeleting]         = useState(false);

  const canManage = user ? canManageUsers(user.role) : false;
  // الدرجات الوظيفية المسموح لهذا المستخدم إنشاؤها/إسنادها (نظام هرمي)
  const allowedRoles = user ? getCreatableRoles(user.role) : [];
  // إعادة تعيين كلمة مرور مستخدم آخر: Super Admin فقط
  const canResetPassword = user ? canResetOtherUserPassword(user.role) : false;

  // ── forms ──────────────────────────────────────────────
  const {
    register, handleSubmit, reset,
    watch,
    formState: { errors },
  } = useForm<UserFormData>({ resolver: zodResolver(userSchema) });

  const {
    register: regPwd, handleSubmit: handlePwdSubmit, reset: resetPwd,
    formState: { errors: pwdErrors },
  } = useForm<PasswordFormData>({ resolver: zodResolver(passwordSchema) });

  // ── load ───────────────────────────────────────────────
  useEffect(() => {
    if (user && canManage) loadUsers();
  }, [user, canManage, page, searchQuery, statusFilter, roleFilter, branchFilter]);

  // فروع الشركة لإظهارها فى فلتر الفرع — تُحمّل مرة واحدة فقط
  useEffect(() => {
    if (user && canManage) fetchBranches().then(setBranches);
  }, [user, canManage]);

  useReconnectRefetch(
    () => { if (user && canManage) loadUsers(); },
    () => { if (user && canManage) loadAllUsers(); },
  );

  // تأخير بسيط (debounce) لتقليل عدد طلبات البحث أثناء الكتابة
  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== searchQuery) {
        setSearchQuery(localSearch);
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch]);

  // load all users once (for manager dropdown)
  useEffect(() => {
    if (user && canManage) loadAllUsers();
  }, [user, canManage]);

  const loadAllUsers = useCallback(async () => {
    setAllUsers(await fetchAllUsers());
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const { users: pageUsers, totalPages: pages, totalCount: count } = await fetchUsersPage({
        page, searchQuery, statusFilter, roleFilter, branchId: branchFilter,
      });
      setUsers(pageUsers);
      setTotalPages(pages);
      setTotalCount(count);
    } catch (err) {
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, statusFilter, roleFilter, branchFilter]);

  // ── open / close modals ────────────────────────────────
  const openEditModal = useCallback((u: User) => {
    if (!canManage) return;
    setEditingUser(u);
    reset({
      name:       u.name,
      email:      u.email,
      phone:      u.phone || '',
      role:       u.role,
      manager_id: u.manager_id || null,
      target:     u.target || 0,
      branch_id:  null,
    });
    setShowModal(true);
  }, [canManage, reset]);

  const openCreateModal = useCallback(() => {
    if (!canManage) return;
    setEditingUser(null);
    reset({ name: '', email: '', phone: '', role: allowedRoles[0] ?? 'agent', manager_id: null, target: 0, branch_id: null });
    setShowModal(true);
  }, [canManage, reset, allowedRoles]);

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
    reset();
  };

  const openPwdModal = useCallback((u: User) => {
    if (!canManage || !canResetPassword) return;
    setEditingUser(u);
    resetPwd({ password: '', confirmPassword: '' });
    setShowPwd(false);
    setShowConfirmPwd(false);
    setShowPwdModal(true);
  }, [canManage, canResetPassword, resetPwd]);

  const closePwdModal = () => {
    setShowPwdModal(false);
    setEditingUser(null);
    resetPwd();
  };

  // ── submit: create / edit user ─────────────────────────
  const onSubmit = async (data: UserFormData) => {
    if (!user || !canManage) return;
    if (!editingUser && managerHasMultipleBranches && !data.branch_id) {
      alert('المدير المختار له أكثر من فرع، يجب اختيار الفرع أولاً');
      return;
    }
    setSaving(true);

    try {
      const { created } = await saveUser(data, editingUser);

      if (!created) {
        alert('✅ تم تحديث بيانات المستخدم بنجاح');
      } else {
        alert(`✅ تم إنشاء المستخدم بنجاح!\nالبريد: ${data.email}\nكلمة المرور المؤقتة: ${TEMP_PASSWORD}`);
        await loadAllUsers();
      }

      closeModal();
      loadUsers();
    } catch (err: any) {
      console.error('Error saving user:', err);
      alert(`حدث خطأ: ${err.message || 'خطأ غير معروف'}`);
    } finally {
      setSaving(false);
    }
  };

  // ── submit: change password ────────────────────────────
  const onPwdSubmit = async (data: PasswordFormData) => {
    if (!user || !canManage || !editingUser) return;
    setSavingPwd(true);

    try {
      await changeUserPassword(editingUser, data);
      alert(`✅ تم تغيير كلمة مرور "${editingUser.name}" بنجاح`);
      closePwdModal();
    } catch (err: any) {
      console.error('Error changing password:', err);
      alert(`حدث خطأ: ${err.message || 'خطأ غير معروف'}`);
    } finally {
      setSavingPwd(false);
    }
  };

  // ── toggle active ──────────────────────────────────────
  const handleToggleActive = useCallback(async (u: User) => {
    if (!canManage) return;
    setTogglingId(u.id);
    try {
      await toggleUserActive(u);
      loadUsers();
    } catch (err) {
      console.error('Error toggling status:', err);
      alert('حدث خطأ أثناء تغيير الحالة');
    } finally {
      setTogglingId(null);
    }
  }, [canManage, loadUsers]);

  // ── delete (soft delete) ───────────────────────────────
  const handleConfirmDelete = async () => {
    if (!canManage || !deletingUser) return;
    setDeleting(true);
    try {
      await softDeleteUser(deletingUser);
      setDeletingUser(null);
      await Promise.all([loadUsers(), loadAllUsers()]);
    } catch (err: any) {
      console.error('Error deleting user:', err);
      alert(`حدث خطأ أثناء حذف المستخدم: ${err.message || 'خطأ غير معروف'}`);
    } finally {
      setDeleting(false);
    }
  };

  // ── filters ─────────────────────────────────────────────
  const hasFilters = searchQuery.trim() !== '' || statusFilter !== 'all' || roleFilter !== 'all' || branchFilter !== 'all';
  const clearFilters = useCallback(() => {
    setLocalSearch('');
    setSearchQuery('');
    setStatusFilter('all');
    setRoleFilter('all');
    setBranchFilter('all');
    setPage(1);
  }, []);

  // ── manager dropdown filtering ─────────────────────────
  const selectedRole = watch('role') as UserRole | undefined;
  const allowedManagers = getAllowedManagers(allUsers, selectedRole, editingUser?.id);

  // ── فرع المستخدم الجديد (مشكلة 3): لو المدير المختار له أكثر من فرع،
  // الترigger فى قاعدة البيانات (056) مش هيقدر يحدده تلقائيًا، فلازم نعرض
  // اختيار صريح هنا ونبعته مع باقي بيانات الإنشاء. بيظهر فقط وقت إنشاء
  // مستخدم جديد (مش وقت التعديل — الفرع بيتغير من UserBranchRolesSection).
  const selectedManagerId = watch('manager_id') as string | null | undefined;
  const [managerBranches, setManagerBranches] = useState<UserBranchRoleRow[]>([]);

  useEffect(() => {
    if (editingUser || !selectedManagerId) {
      setManagerBranches([]);
      return;
    }
    let cancelled = false;
    fetchUserBranchRolesForUser(selectedManagerId).then((rows) => {
      if (!cancelled) setManagerBranches(rows);
    });
    return () => { cancelled = true; };
  }, [editingUser, selectedManagerId]);

  const managerHasMultipleBranches = managerBranches.length > 1;

  // ── guard ──────────────────────────────────────────────
  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <Shield className="w-16 h-16 text-secondary-300 mb-4" />
        <p className="text-secondary-500">ليس لديك صلاحية للوصول لهذه الصفحة</p>
      </div>
    );
  }

  // ── render ─────────────────────────────────────────────
  return (
    <div className="space-y-5 animate-fadeIn pb-4">

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold text-secondary-900">إدارة المستخدمين</h2>
          <p className="text-sm text-secondary-500 mt-0.5">إدارة المستخدمين والهيكل الإداري</p>
        </div>
        <button onClick={openCreateModal} className="btn btn-primary w-full sm:w-auto shadow-sm">
          <Plus className="w-5 h-5" />
          <span>إضافة مستخدم</span>
        </button>
      </div>

      {/* Filters */}
      <div className="card space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="بحث بالاسم أو البريد الإلكتروني..."
              className="input-field pr-10 pl-9"
            />
            {localSearch && (
              <button
                onClick={() => setLocalSearch('')}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-secondary-100 text-secondary-400 hover:text-secondary-600"
                aria-label="مسح البحث"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Segmented status filter */}
          <div className="flex items-center bg-secondary-100 rounded-lg p-1 shrink-0">
            {STATUS_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => { setStatusFilter(opt.value); setPage(1); }}
                className={clsx(
                  'flex-1 sm:flex-none px-3.5 py-2 rounded-md text-sm font-medium transition-all duration-200 whitespace-nowrap',
                  statusFilter === opt.value
                    ? 'bg-white text-primary-700 shadow-sm'
                    : 'text-secondary-500 hover:text-secondary-800'
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3">
          {/* فلتر حسب الدرجة الوظيفية */}
          <select
            value={roleFilter}
            onChange={(e) => { setRoleFilter(e.target.value as UserRole | 'all'); setPage(1); }}
            className="input-field flex-1"
          >
            <option value="all">كل الدرجات الوظيفية</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>{ROLE_LABELS[r]}</option>
            ))}
          </select>

          {/* فلتر حسب الفرع */}
          <select
            value={branchFilter}
            onChange={(e) => { setBranchFilter(e.target.value); setPage(1); }}
            className="input-field flex-1"
          >
            <option value="all">كل الفروع</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
        </div>

        {/* عدد النتائج — بنفس مكانه وشكله فى صفحات العملاء/الوثائق/التحصيل */}
        {!isInitialLoading && (
          <p className="text-xs text-secondary-500 flex items-center gap-2">
            <span>عدد النتائج: <span className="font-semibold text-secondary-700">{totalCount}</span></span>
            {loading && (
              <span className="inline-flex items-center gap-1 text-secondary-400">
                <span className="w-3 h-3 rounded-full border-2 border-secondary-300 border-t-primary-500 animate-spin" />
                <span>جارِ التحديث...</span>
              </span>
            )}
          </p>
        )}
      </div>

      {/* Users grid */}
      <UsersGrid
        users={users}
        isInitialLoading={isInitialLoading}
        page={page}
        totalPages={totalPages}
        setPage={setPage}
        togglingId={togglingId}
        hasFilters={hasFilters}
        onClearFilters={clearFilters}
        onAddUser={openCreateModal}
        onViewDetails={setViewingUser}
        onEdit={openEditModal}
        onChangePassword={openPwdModal}
        canResetPassword={canResetPassword}
        onToggleActive={handleToggleActive}
        onDelete={setDeletingUser}
      />

      {/* ══════════════════════════════════════════════════
          MODAL: Create / Edit User
      ══════════════════════════════════════════════════ */}
      {showModal && (
        <UserFormModal
          editingUser={editingUser}
          saving={saving}
          register={register}
          handleSubmit={handleSubmit}
          errors={errors}
          selectedRole={selectedRole}
          allowedManagers={allowedManagers}
          allowedRoles={allowedRoles}
          managerBranches={managerHasMultipleBranches ? managerBranches : []}
          onSubmit={onSubmit}
          onClose={closeModal}
        />
      )}

      {/* ══════════════════════════════════════════════════
          MODAL: Change Password
      ══════════════════════════════════════════════════ */}
      {showPwdModal && editingUser && (
        <PasswordModal
          editingUser={editingUser}
          savingPwd={savingPwd}
          showPwd={showPwd}
          showConfirmPwd={showConfirmPwd}
          setShowPwd={setShowPwd}
          setShowConfirmPwd={setShowConfirmPwd}
          register={regPwd}
          handleSubmit={handlePwdSubmit}
          errors={pwdErrors}
          onSubmit={onPwdSubmit}
          onClose={closePwdModal}
        />
      )}

      {/* ══════════════════════════════════════════════════
          MODAL: View Details
      ══════════════════════════════════════════════════ */}
      {viewingUser && (
        <UserDetailsModal
          user={viewingUser}
          onClose={() => setViewingUser(null)}
        />
      )}

      {/* ══════════════════════════════════════════════════
          MODAL: Delete User (Soft Delete)
      ══════════════════════════════════════════════════ */}
      {deletingUser && (
        <DeleteUserModal
          user={deletingUser}
          deleting={deleting}
          onConfirm={handleConfirmDelete}
          onClose={() => setDeletingUser(null)}
        />
      )}

    </div>
  );
}
