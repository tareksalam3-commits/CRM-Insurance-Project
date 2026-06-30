import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  supabase,
  User,
  UserRole,
  ROLE_LABELS,
  getRoleLevel,
  canManageUsers
} from '../lib/supabase';
import {
  Plus,
  Search,
  Edit2,
  X,
  Shield,
  ChevronLeft,
  ChevronRight,
  UserCheck,
  UserX,
  Mail,
  Phone,
  Users as UsersIcon,
  Lock,
  Eye,
  EyeOff,
  Save
} from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

// ────────────────────────────────────────────────────────────
// Schemas
// ────────────────────────────────────────────────────────────
const userSchema = z.object({
  name:       z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل'),
  email:      z.string().email('البريد الإلكتروني غير صحيح'),
  phone:      z.string().optional(),
  role:       z.enum(['super_admin', 'development_manager', 'general_supervisor', 'supervisor', 'group_leader', 'agent', 'premium_agent']),
  manager_id: z.string().optional().nullable(),
  target:     z.number().min(0).optional(),
});

const passwordSchema = z.object({
  password:        z.string().min(6, 'كلمة المرور يجب أن تكون 6 أحرف على الأقل'),
  confirmPassword: z.string().min(6, 'تأكيد كلمة المرور مطلوب'),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'كلمتا المرور غير متطابقتين',
  path: ['confirmPassword'],
});

type UserFormData     = z.infer<typeof userSchema>;
type PasswordFormData = z.infer<typeof passwordSchema>;

const ROLES: UserRole[] = [
  'super_admin', 'development_manager', 'general_supervisor',
  'supervisor', 'group_leader', 'agent', 'premium_agent',
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
  const [showModal, setShowModal]       = useState(false);
  const [showPwdModal, setShowPwdModal] = useState(false);
  const [editingUser, setEditingUser]   = useState<User | null>(null);
  const [saving, setSaving]             = useState(false);
  const [savingPwd, setSavingPwd]       = useState(false);
  const [page, setPage]                 = useState(1);
  const [totalPages, setTotalPages]     = useState(1);
  const [searchQuery, setSearchQuery]   = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [showPwd, setShowPwd]           = useState(false);
  const [showConfirmPwd, setShowConfirmPwd] = useState(false);
  const [togglingId, setTogglingId]     = useState<string | null>(null);
  const pageSize = 10;

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

  // load all users once (for manager dropdown)
  useEffect(() => {
    if (user && canManage) loadAllUsers();
  }, [user, canManage]);

  const loadAllUsers = async () => {
    const { data } = await supabase
      .from('users')
      .select('id, name, role')
      .order('name');
    setAllUsers((data as User[]) || []);
  };

  const loadUsers = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from('users')
        .select('*, manager:manager_id(id, name)', { count: 'exact' })
        .order('created_at', { ascending: false });

      if (searchQuery) {
        query = query.or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`);
      }
      if (statusFilter !== 'all') {
        query = query.eq('is_active', statusFilter === 'active');
      }

      const from = (page - 1) * pageSize;
      const to   = from + pageSize - 1;

      const { data, error, count } = await query.range(from, to);
      if (error) throw error;

      setUsers(data as User[]);
      setTotalPages(Math.ceil((count || 0) / pageSize));
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
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error('لا توجد جلسة نشطة');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      if (editingUser) {
        // ── UPDATE existing user ──────────────────────────
        const oldData = editingUser;

        // 1. update profile row
        const { error: updateErr } = await supabase
          .from('users')
          .update({
            name:       data.name,
            phone:      data.phone || null,
            role:       data.role,
            manager_id: data.manager_id || null,
            target:     data.target || 0,
            updated_at: new Date().toISOString(),
          })
          .eq('id', editingUser.id);

        if (updateErr) throw updateErr;

        // 2. if email changed → update via admin API
        if (data.email !== oldData.email) {
          const res = await fetch(`${supabaseUrl}/functions/v1/admin-update-user`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ user_id: editingUser.id, email: data.email }),
          });
          if (!res.ok) {
            const r = await res.json();
            throw new Error(r?.error || 'فشل تحديث البريد الإلكتروني');
          }
          // also update email in users table
          await supabase
            .from('users')
            .update({ email: data.email })
            .eq('id', editingUser.id);
        }

        // 3. log
        const action =
          oldData.role   !== data.role   ? 'role_update'   :
          oldData.target !== data.target ? 'target_update' : 'user_update';

        await supabase.rpc('log_activity', {
          p_action:       action,
          p_entity_type:  'user',
          p_entity_id:    editingUser.id,
          p_old_values:   oldData,
          p_new_values:   data,
        });

        alert('✅ تم تحديث بيانات المستخدم بنجاح');
      } else {
        // ── CREATE new user ───────────────────────────────
        const tempPassword = '123456';

        const res = await fetch(`${supabaseUrl}/functions/v1/admin-create-user`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            name:       data.name,
            email:      data.email,
            password:   tempPassword,
            phone:      data.phone || null,
            role:       data.role,
            manager_id: data.manager_id || null,
            target:     data.target || 0,
          }),
        });

        const result = await res.json();
        if (!res.ok) {
          const msg = result?.error || 'خطأ غير معروف';
          if (msg.includes('already registered') || msg.includes('already been registered')) {
            throw new Error('البريد الإلكتروني مسجل مسبقاً');
          }
          throw new Error(msg);
        }

        alert(`✅ تم إنشاء المستخدم بنجاح!\nالبريد: ${data.email}\nكلمة المرور المؤقتة: ${tempPassword}`);
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
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) throw new Error('لا توجد جلسة نشطة');

      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

      const res = await fetch(`${supabaseUrl}/functions/v1/admin-update-user`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${accessToken}`,
        },
        body: JSON.stringify({
          user_id:  editingUser.id,
          password: data.password,
        }),
      });

      if (!res.ok) {
        const r = await res.json();
        throw new Error(r?.error || 'فشل تغيير كلمة المرور');
      }

      await supabase.rpc('log_activity', {
        p_action:      'user_update',
        p_entity_type: 'user',
        p_entity_id:   editingUser.id,
        p_old_values:  null,
        p_new_values:  { password_changed: true },
      });

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
      const { error } = await supabase
        .from('users')
        .update({ is_active: !u.is_active, updated_at: new Date().toISOString() })
        .eq('id', u.id);

      if (error) throw error;

      await supabase.rpc('log_activity', {
        p_action:      u.is_active ? 'user_disable' : 'user_enable',
        p_entity_type: 'user',
        p_entity_id:   u.id,
      });

      loadUsers();
    } catch (err) {
      console.error('Error toggling status:', err);
      alert('حدث خطأ أثناء تغيير الحالة');
    } finally {
      setTogglingId(null);
    }
  };

  // ── helpers ────────────────────────────────────────────
  const getRoleBadgeClass = (role: UserRole) => {
    switch (getRoleLevel(role)) {
      case 1:  return 'bg-error-100 text-error-700 border-error-200';
      case 2:  return 'bg-warning-100 text-warning-700 border-warning-200';
      case 3:  return 'bg-info-100 text-info-700 border-info-200';
      case 4:  return 'bg-primary-100 text-primary-700 border-primary-200';
      case 5:  return 'bg-success-100 text-success-700 border-success-200';
      default: return 'bg-secondary-100 text-secondary-700 border-secondary-200';
    }
  };

  // ── manager dropdown filtering ─────────────────────────
  // كل درجة وظيفية لها درجة واحدة فقط مسموح يكون هو المدير المباشر
  const EXPECTED_PARENT: Partial<Record<UserRole, UserRole>> = {
    development_manager:  'super_admin',
    general_supervisor:   'development_manager',
    supervisor:           'general_supervisor',
    group_leader:         'supervisor',      // رئيس المجموعة لا بد تحت مراقب
    agent:                'group_leader',
    premium_agent:        'group_leader',
  };

  const selectedRole = watch('role') as UserRole | undefined;

  const allowedManagers = allUsers.filter((u) => {
    if (!selectedRole) return true;
    if (u.id === editingUser?.id) return false;
    const expected = EXPECTED_PARENT[selectedRole];
    if (!expected) return false; // super_admin مثلاً ما يحتاج مدير
    return u.role === expected;
  });

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
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
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

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : users.length === 0 ? (
          <div className="text-center py-12">
            <UsersIcon className="w-16 h-16 text-secondary-300 mx-auto mb-4" />
            <p className="text-secondary-500">لا يوجد مستخدمون</p>
          </div>
        ) : (
          <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>البريد الإلكتروني</th>
                    <th>الهاتف</th>
                    <th>الدرجة الوظيفية</th>
                    <th>المدير المباشر</th>
                    <th>التارجت</th>
                    <th>الحالة</th>
                    <th>آخر دخول</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id}>
                      <td className="font-medium">{u.name}</td>
                      <td dir="ltr" className="text-left text-sm">{u.email}</td>
                      <td dir="ltr" className="text-left">{u.phone || '-'}</td>
                      <td>
                        <span className={clsx('badge border', getRoleBadgeClass(u.role))}>
                          {ROLE_LABELS[u.role]}
                        </span>
                      </td>
                      <td>{(u as any).manager?.name || '-'}</td>
                      <td>
                        {u.target > 0
                          ? new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0 }).format(u.target)
                          : '-'}
                      </td>
                      <td>
                        <span className={clsx('badge', u.is_active ? 'badge-success' : 'badge-error')}>
                          {u.is_active ? 'نشط' : 'غير نشط'}
                        </span>
                      </td>
                      <td className="text-sm">
                        {u.last_login ? format(new Date(u.last_login), 'dd/MM/yyyy HH:mm') : '-'}
                      </td>
                      <td>
                        <div className="flex items-center gap-1">

                          {/* Edit data */}
                          <button
                            onClick={() => openEditModal(u)}
                            className="p-1.5 rounded-lg hover:bg-secondary-100 text-secondary-600 hover:text-secondary-900 transition-colors"
                            title="تعديل البيانات"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          {/* Change password */}
                          <button
                            onClick={() => openPwdModal(u)}
                            className="p-1.5 rounded-lg hover:bg-warning-50 text-warning-600 hover:text-warning-700 transition-colors"
                            title="تغيير كلمة المرور"
                          >
                            <Lock className="w-4 h-4" />
                          </button>

                          {/* Toggle active */}
                          <button
                            onClick={() => handleToggleActive(u)}
                            disabled={togglingId === u.id}
                            className={clsx(
                              'p-1.5 rounded-lg transition-colors disabled:opacity-50',
                              u.is_active
                                ? 'hover:bg-error-50 text-error-600 hover:text-error-700'
                                : 'hover:bg-success-50 text-success-600 hover:text-success-700'
                            )}
                            title={u.is_active ? 'تعطيل الحساب' : 'تفعيل الحساب'}
                          >
                            {togglingId === u.id
                              ? <div className="w-4 h-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                              : u.is_active
                                ? <UserX className="w-4 h-4" />
                                : <UserCheck className="w-4 h-4" />
                            }
                          </button>

                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-secondary-200">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page === 1}
                  className="btn btn-ghost disabled:opacity-50"
                >
                  <ChevronRight className="w-5 h-5" />
                  <span>السابق</span>
                </button>
                <span className="text-sm text-secondary-600">صفحة {page} من {totalPages}</span>
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page === totalPages}
                  className="btn btn-ghost disabled:opacity-50"
                >
                  <span>التالي</span>
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>
            )}
          </>
        )}
      </div>

      {/* ══════════════════════════════════════════════════
          MODAL: Create / Edit User
      ══════════════════════════════════════════════════ */}
      {showModal && (
        <div className="modal-overlay" onClick={closeModal}>
          <div
            className="modal-content max-w-lg animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-secondary-200">
              <h3 className="text-lg font-semibold text-secondary-900">
                {editingUser ? `تعديل: ${editingUser.name}` : 'إضافة مستخدم جديد'}
              </h3>
              <button onClick={closeModal} className="p-2 rounded-lg hover:bg-secondary-100">
                <X className="w-5 h-5 text-secondary-600" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">

              {/* Name */}
              <div className="form-group">
                <label className="input-label">الاسم *</label>
                <input
                  {...register('name')}
                  className={clsx('input-field', errors.name && 'border-error-500')}
                  placeholder="أدخل اسم المستخدم"
                />
                {errors.name && <p className="text-sm text-error-600 mt-1">{errors.name.message}</p>}
              </div>

              {/* Email */}
              <div className="form-group">
                <label className="input-label">البريد الإلكتروني *</label>
                <div className="relative">
                  <input
                    {...register('email')}
                    type="email"
                    dir="ltr"
                    className={clsx('input-field pl-10', errors.email && 'border-error-500')}
                    placeholder="example@company.com"
                  />
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                </div>
                {errors.email && <p className="text-sm text-error-600 mt-1">{errors.email.message}</p>}
                {editingUser && (
                  <p className="text-xs text-secondary-400 mt-1">يمكنك تعديل البريد الإلكتروني</p>
                )}
              </div>

              {/* Phone */}
              <div className="form-group">
                <label className="input-label">رقم الهاتف</label>
                <div className="relative">
                  <input
                    {...register('phone')}
                    dir="ltr"
                    className="input-field pl-10"
                    placeholder="01xxxxxxxxx"
                  />
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                </div>
              </div>

              {/* Role + Manager */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="input-label">الدرجة الوظيفية *</label>
                  <select {...register('role')} className="input-field">
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="input-label">المدير المباشر</label>
                  <select {...register('manager_id')} className="input-field">
                    <option value="">بدون مدير</option>
                    {allowedManagers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} — {ROLE_LABELS[u.role]}
                      </option>
                    ))}
                  </select>
                  {selectedRole && EXPECTED_PARENT[selectedRole] && allowedManagers.length === 0 && (
                    <p className="text-xs text-error-600 mt-1">
                      لا يوجد {ROLE_LABELS[EXPECTED_PARENT[selectedRole]!]} متاح — يجب إضافته أولاً
                    </p>
                  )}
                  {selectedRole && EXPECTED_PARENT[selectedRole] && (
                    <p className="text-xs text-secondary-400 mt-1">
                      يجب أن يكون المدير المباشر: {ROLE_LABELS[EXPECTED_PARENT[selectedRole]!]}
                    </p>
                  )}
                </div>
              </div>

              {/* Target */}
              <div className="form-group">
                <label className="input-label">التارجت الشهري</label>
                <div className="relative">
                  <input
                    {...register('target', { valueAsNumber: true })}
                    type="number"
                    min="0"
                    className="input-field pl-16"
                    placeholder="0"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400 text-sm">
                    جنيه
                  </span>
                </div>
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-secondary-200">
                <button type="button" onClick={closeModal} className="btn btn-secondary">
                  إلغاء
                </button>
                <button type="submit" disabled={saving} className="btn btn-primary">
                  {saving ? (
                    <>
                      <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>جاري الحفظ...</span>
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      <span>حفظ التغييرات</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ══════════════════════════════════════════════════
          MODAL: Change Password
      ══════════════════════════════════════════════════ */}
      {showPwdModal && editingUser && (
        <div className="modal-overlay" onClick={closePwdModal}>
          <div
            className="modal-content max-w-md animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between p-6 border-b border-secondary-200">
              <div>
                <h3 className="text-lg font-semibold text-secondary-900">تغيير كلمة المرور</h3>
                <p className="text-sm text-secondary-500 mt-0.5">{editingUser.name}</p>
              </div>
              <button onClick={closePwdModal} className="p-2 rounded-lg hover:bg-secondary-100">
                <X className="w-5 h-5 text-secondary-600" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handlePwdSubmit(onPwdSubmit)} className="p-6 space-y-4">

              {/* New password */}
              <div className="form-group">
                <label className="input-label">كلمة المرور الجديدة *</label>
                <div className="relative">
                  <input
                    {...regPwd('password')}
                    type={showPwd ? 'text' : 'password'}
                    dir="ltr"
                    className={clsx('input-field pl-10 pr-10', pwdErrors.password && 'border-error-500')}
                    placeholder="أدخل كلمة المرور الجديدة"
                    autoComplete="new-password"
                  />
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400 hover:text-secondary-600"
                  >
                    {showPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {pwdErrors.password && (
                  <p className="text-sm text-error-600 mt-1">{pwdErrors.password.message}</p>
                )}
              </div>

              {/* Confirm password */}
              <div className="form-group">
                <label className="input-label">تأكيد كلمة المرور *</label>
                <div className="relative">
                  <input
                    {...regPwd('confirmPassword')}
                    type={showConfirmPwd ? 'text' : 'password'}
                    dir="ltr"
                    className={clsx('input-field pl-10 pr-10', pwdErrors.confirmPassword && 'border-error-500')}
                    placeholder="أعد إدخال كلمة المرور"
                    autoComplete="new-password"
                  />
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPwd((v) => !v)}
                    className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400 hover:text-secondary-600"
                  >
                    {showConfirmPwd ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {pwdErrors.confirmPassword && (
                  <p className="text-sm text-error-600 mt-1">{pwdErrors.confirmPassword.message}</p>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-3 pt-4 border-t border-secondary-200">
                <button type="button" onClick={closePwdModal} className="btn btn-secondary">
                  إلغاء
                </button>
                <button type="submit" disabled={savingPwd} className="btn btn-primary">
                  {savingPwd ? (
                    <>
                      <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      <span>جاري التغيير...</span>
                    </>
                  ) : (
                    <>
                      <Lock className="w-4 h-4" />
                      <span>تغيير كلمة المرور</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
