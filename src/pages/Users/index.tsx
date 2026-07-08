import { useState, useEffect } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { User, UserRole, canManageUsers } from '../../lib/supabase';
import { Plus, Search, Shield } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { userSchema, passwordSchema, type UserFormData, type PasswordFormData } from './types';
import { getAllowedManagers } from './business/roleHierarchy';
import {
  fetchAllUsers, fetchUsersPage, saveUser, changeUserPassword, toggleUserActive, TEMP_PASSWORD,
} from './services/usersService';
import { UsersTable } from './components/UsersTable';
import { UserFormModal } from './components/UserFormModal';
import { PasswordModal } from './components/PasswordModal';

// ────────────────────────────────────────────────────────────
// Component
// ────────────────────────────────────────────────────────────
export function Users() {
  const { user } = useAuth();

  // ── state ──────────────────────────────────────────────
  const [users, setUsers]               = useState<User[]>([]);
  const [allUsers, setAllUsers]         = useState<User[]>([]); // for manager dropdown
  const [loading, setLoading]           = useState(true);
  const [showModal, setShowModal]       = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [editingUser, setEditingUser]   = useState<User | null>(null);
  const [saving, setSaving]             = useState(false);
  const [savingPwd, setSavingPwd]       = useState(false);
  const [page, setPage]                 = useState(1);
  const [totalPages, setTotalPages]     = useState(1);
  const [searchQuery, setSearchQuery]   = useState('');
  const [localSearch, setLocalSearch]   = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showPwd, setShowPwd]           = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [togglingId, setTogglingId]     = useState<string | null>(null);

  const canManage = user ? canManageUsers(user.role) : false;

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
  }, [user, canManage, page, searchQuery, statusFilter]);

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

  const loadAllUsers = async () => {
    setAllUsers(await fetchAllUsers());
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      const { users: pageUsers, totalPages: pages } = await fetchUsersPage({ page, searchQuery, statusFilter });
      setUsers(pageUsers);
      setTotalPages(pages);
    } catch (err) {
      console.error('Error loading users:', err);
    } finally {
      setLoading(false);
    }
  };

  // ── open / close modals ────────────────────────────────
  const openEditModal = (u: User) => {
    if (!canManage) return;
    setEditingUser(u);
    reset({
      name:       u.name,
      email:      u.email,
      phone:      u.phone || '',
      role:       u.role,
      manager_id: u.manager_id || null,
      target:     u.target || 0,
    });
    setShowModal(true);
  };

  const openCreateModal = () => {
    if (!canManage) return;
    setEditingUser(null);
    reset({ name: '', email: '', phone: '', role: 'agent', manager_id: null, target: 0 });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingUser(null);
    reset();
  };

  const openPwdModal = (u: User) => {
    if (!canManage) return;
    setEditingUser(u);
    resetPwd({ password: '', confirmPassword: '' });
    setShowPwd(false);
    setShowConfirmPwd(false);
    setShowPwdModal(true);
  };

  const closePwdModal = () => {
    setShowPwdModal(false);
    setEditingUser(null);
    resetPwd();
  };

  // ── submit: create / edit user ─────────────────────────
  const onSubmit = async (data: UserFormData) => {
    if (!user || !canManage) return;
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
  const handleToggleActive = async (u: User) => {
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
  };

  // ── manager dropdown filtering ─────────────────────────
  const selectedRole = watch('role') as UserRole | undefined;
  const allowedManagers = getAllowedManagers(allUsers, selectedRole, editingUser?.id);

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
    <div className="space-y-6 animate-fadeIn">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-secondary-900">المستخدمون</h2>
          <p className="text-sm text-secondary-500 mt-1">إدارة المستخدمين والهيكل الإداري</p>
        </div>
        <button onClick={openCreateModal} className="btn btn-primary">
          <Plus className="w-5 h-5" />
          <span>إضافة مستخدم</span>
        </button>
      </div>

      {/* Table card */}
      <div className="card">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
            <input
              type="text"
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
              placeholder="بحث بالاسم أو البريد..."
              className="input-field pr-10"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value as any); setPage(1); }}
            className="input-field w-auto"
          >
            <option value="all">جميع الحالات</option>
            <option value="active">نشط</option>
            <option value="inactive">غير نشط</option>
          </select>
        </div>

        <UsersTable
          users={users}
          loading={loading}
          page={page}
          totalPages={totalPages}
          setPage={setPage}
          togglingId={togglingId}
          onEdit={openEditModal}
          onChangePassword={openPwdModal}
          onToggleActive={handleToggleActive}
        />
      </div>

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

    </div>
  );
}
