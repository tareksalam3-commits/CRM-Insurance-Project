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
  Users as UsersIcon
} from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';

const userSchema = z.object({
  name: z.string().min(2, 'الاسم يجب أن يكون حرفين على الأقل'),
  email: z.string().email('البريد الإلكتروني غير صحيح'),
  phone: z.string().optional(),
  role: z.enum(['super_admin', 'development_manager', 'general_supervisor', 'supervisor', 'group_leader', 'agent', 'premium_agent']),
  manager_id: z.string().optional().nullable(),
  target: z.number().min(0).optional()
});

type UserFormData = z.infer<typeof userSchema>;

const ROLES: UserRole[] = [
  'super_admin',
  'development_manager',
  'general_supervisor',
  'supervisor',
  'group_leader',
  'agent',
  'premium_agent'
];

export function Users() {
  const { user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const pageSize = 10;

  const canManage = user ? canManageUsers(user.role) : false;

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<UserFormData>({
    resolver: zodResolver(userSchema)
  });

  useEffect(() => {
    if (user && canManage) {
      loadUsers();
    }
  }, [user, page, searchQuery, statusFilter]);

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
      const to = from + pageSize - 1;

      const { data, error, count } = await query.range(from, to);

      if (error) throw error;

      setUsers(data as User[]);
      setTotalPages(Math.ceil((count || 0) / pageSize));
    } catch (error) {
      console.error('Error loading users:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (userData?: User) => {
    if (!canManage) return;

    if (userData) {
      setEditingUser(userData);
      reset({
        name: userData.name,
        email: userData.email,
        phone: userData.phone || '',
        role: userData.role,
        manager_id: userData.manager_id || null,
        target: userData.target || 0
      });
    } else {
      setEditingUser(null);
      reset({
        name: '',
        email: '',
        phone: '',
        role: 'agent',
        manager_id: null,
        target: 0
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingUser(null);
    reset();
  };

  const onSubmit = async (data: UserFormData) => {
    if (!user || !canManage) return;
    setSaving(true);

    try {
      if (editingUser) {
        const oldData = editingUser;

        const { error } = await supabase
          .from('users')
          .update({
            ...data,
            target: data.target || 0,
            updated_at: new Date().toISOString()
          })
          .eq('id', editingUser.id);

        if (error) throw error;

        const action = oldData.role !== data.role ? 'role_update' :
                       oldData.target !== data.target ? 'target_update' : 'user_update';

        await supabase.rpc('log_activity', {
          p_action: action,
          p_entity_type: 'user',
          p_entity_id: editingUser.id,
          p_old_values: oldData,
          p_new_values: data
        });
      } else {
        const tempPassword = Math.random().toString(36).slice(-8) + 'A1';

        const { data: authData, error: authError } = await supabase.auth.signUp({
          email: data.email,
          password: tempPassword,
          options: {
            data: {
              name: data.name
            }
          }
        });

        if (authError) throw authError;

        if (authData.user) {
          const { error: profileError } = await supabase
            .from('users')
            .insert({
              id: authData.user.id,
              name: data.name,
              email: data.email,
              phone: data.phone,
              role: data.role,
              manager_id: data.manager_id,
              target: data.target || 0
            });

          if (profileError) throw profileError;

          await supabase.rpc('log_activity', {
            p_action: 'user_create',
            p_entity_type: 'user'
          });

          alert(`تم إنشاء المستخدم بنجاح!\nكلمة المرور المؤقتة: ${tempPassword}\nيرجى تغييرها فوراً`);
        }
      }

      handleCloseModal();
      loadUsers();
    } catch (error: any) {
      console.error('Error saving user:', error);
      if (error.code === '23505' || error.message?.includes('already registered')) {
        alert('البريد الإلكتروني مسجل مسبقاً');
      } else {
        alert('حدث خطأ أثناء الحفظ');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleToggleActive = async (userData: User) => {
    if (!canManage) return;

    try {
      const { error } = await supabase
        .from('users')
        .update({
          is_active: !userData.is_active,
          updated_at: new Date().toISOString()
        })
        .eq('id', userData.id);

      if (error) throw error;

      await supabase.rpc('log_activity', {
        p_action: userData.is_active ? 'user_disable' : 'user_enable',
        p_entity_type: 'user',
        p_entity_id: userData.id
      });

      loadUsers();
    } catch (error) {
      console.error('Error toggling user status:', error);
      alert('حدث خطأ أثناء تغيير الحالة');
    }
  };

  const getRoleBadgeClass = (role: UserRole) => {
    const level = getRoleLevel(role);
    switch (level) {
      case 1:
        return 'bg-error-100 text-error-700 border-error-200';
      case 2:
        return 'bg-warning-100 text-warning-700 border-warning-200';
      case 3:
        return 'bg-info-100 text-info-700 border-info-200';
      case 4:
        return 'bg-primary-100 text-primary-700 border-primary-200';
      case 5:
        return 'bg-success-100 text-success-700 border-success-200';
      default:
        return 'bg-secondary-100 text-secondary-700 border-secondary-200';
    }
  };

  if (!canManage) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <Shield className="w-16 h-16 text-secondary-300 mb-4" />
        <p className="text-secondary-500">ليس لديك صلاحية للوصول لهذه الصفحة</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-secondary-900">المستخدمون</h2>
          <p className="text-sm text-secondary-500 mt-1">إدارة المستخدمين والهيكل الإداري</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn btn-primary"
        >
          <Plus className="w-5 h-5" />
          <span>إضافة مستخدم</span>
        </button>
      </div>

      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  setPage(1);
                }}
                placeholder="بحث بالاسم أو البريد الإلكتروني..."
                className="input-field pr-10"
              />
            </div>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value as 'all' | 'active' | 'inactive');
              setPage(1);
            }}
            className="input-field w-auto"
          >
            <option value="all">جميع الحالات</option>
            <option value="active">نشط</option>
            <option value="inactive">غير نشط</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
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
                      <td dir="ltr" className="text-left">{u.email}</td>
                      <td dir="ltr" className="text-left">{u.phone || '-'}</td>
                      <td>
                        <span
                          className={clsx(
                            'badge border',
                            getRoleBadgeClass(u.role)
                          )}
                        >
                          {ROLE_LABELS[u.role]}
                        </span>
                      </td>
                      <td>{(u as any).manager?.name || '-'}</td>
                      <td>
                        {u.target > 0
                          ? new Intl.NumberFormat('ar-EG', {
                              style: 'currency',
                              currency: 'EGP',
                              minimumFractionDigits: 0
                            }).format(u.target)
                          : '-'}
                      </td>
                      <td>
                        <span
                          className={clsx(
                            'badge',
                            u.is_active ? 'badge-success' : 'badge-error'
                          )}
                        >
                          {u.is_active ? 'نشط' : 'غير نشط'}
                        </span>
                      </td>
                      <td>
                        {u.last_login
                          ? format(new Date(u.last_login), 'dd/MM/yyyy HH:mm')
                          : '-'}
                      </td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenModal(u)}
                            className="p-1.5 rounded-lg hover:bg-secondary-100 text-secondary-600 hover:text-secondary-900"
                            title="تعديل"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleActive(u)}
                            className={clsx(
                              'p-1.5 rounded-lg',
                              u.is_active
                                ? 'hover:bg-error-50 text-error-600 hover:text-error-700'
                                : 'hover:bg-success-50 text-success-600 hover:text-success-700'
                            )}
                            title={u.is_active ? 'تعطيل' : 'تفعيل'}
                          >
                            {u.is_active ? (
                              <UserX className="w-4 h-4" />
                            ) : (
                              <UserCheck className="w-4 h-4" />
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

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
                <span className="text-sm text-secondary-600">
                  صفحة {page} من {totalPages}
                </span>
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

      {showModal && (
        <div className="modal-overlay" onClick={handleCloseModal}>
          <div
            className="modal-content max-w-lg animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-secondary-200">
              <h3 className="text-lg font-semibold text-secondary-900">
                {editingUser ? 'تعديل المستخدم' : 'إضافة مستخدم جديد'}
              </h3>
              <button
                onClick={handleCloseModal}
                className="p-2 rounded-lg hover:bg-secondary-100"
              >
                <X className="w-5 h-5 text-secondary-600" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
              <div className="form-group">
                <label className="input-label">الاسم *</label>
                <input
                  {...register('name')}
                  className={clsx('input-field', errors.name && 'border-error-500')}
                  placeholder="أدخل اسم المستخدم"
                />
                {errors.name && (
                  <p className="text-sm text-error-600 mt-1">{errors.name.message}</p>
                )}
              </div>

              <div className="form-group">
                <label className="input-label">البريد الإلكتروني *</label>
                <div className="relative">
                  <input
                    {...register('email')}
                    type="email"
                    className={clsx('input-field', errors.email && 'border-error-500')}
                    placeholder="example@company.com"
                    dir="ltr"
                    disabled={!!editingUser}
                  />
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                </div>
                {errors.email && (
                  <p className="text-sm text-error-600 mt-1">{errors.email.message}</p>
                )}
              </div>

              <div className="form-group">
                <label className="input-label">رقم الهاتف</label>
                <div className="relative">
                  <input
                    {...register('phone')}
                    className="input-field"
                    placeholder="01xxxxxxxxx"
                    dir="ltr"
                  />
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="input-label">الدرجة الوظيفية *</label>
                  <select
                    {...register('role')}
                    className="input-field"
                  >
                    {ROLES.map((role) => (
                      <option key={role} value={role}>
                        {ROLE_LABELS[role]}
                        {user && getRoleLevel(role) < getRoleLevel(user.role) && ' ⚠️'}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="input-label">المدير المباشر</label>
                  <select
                    {...register('manager_id')}
                    className="input-field"
                  >
                    <option value="">بدون مدير</option>
                    {users
                      .filter((u) => u.id !== editingUser?.id)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({ROLE_LABELS[u.role]})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              <div className="form-group">
                <label className="input-label">التارجت الشهري</label>
                <div className="relative">
                  <input
                    {...register('target', { valueAsNumber: true })}
                    type="number"
                    min="0"
                    className="input-field pl-16"
                    placeholder="أدخل قيمة التارجت"
                  />
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400 text-sm">
                    جنيه
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-secondary-200">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="btn btn-secondary"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="btn btn-primary"
                >
                  {saving ? 'جاري الحفظ...' : 'حفظ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
