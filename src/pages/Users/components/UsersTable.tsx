import {
  Edit2, ChevronLeft, ChevronRight, UserCheck, UserX,
  Users as UsersIcon, Lock,
} from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { ROLE_LABELS, type User } from '../../../lib/supabase';
import { getRoleBadgeClass } from '../business/roleHierarchy';

interface UsersTableProps {
  users: User[];
  loading: boolean;
  page: number;
  totalPages: number;
  setPage: (updater: (p: number) => number) => void;
  togglingId: string | null;
  onEdit: (u: User) => void;
  onChangePassword: (u: User) => void;
  onToggleActive: (u: User) => void;
}

export function UsersTable({
  users, loading, page, totalPages, setPage,
  togglingId, onEdit, onChangePassword, onToggleActive,
}: UsersTableProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-48">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (users.length === 0) {
    return (
      <div className="text-center py-12">
        <UsersIcon className="w-16 h-16 text-secondary-300 mx-auto mb-4" />
        <p className="text-secondary-500">لا يوجد مستخدمون</p>
      </div>
    );
  }

  return (
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
                      onClick={() => onEdit(u)}
                      className="p-1.5 rounded-lg hover:bg-secondary-100 text-secondary-600 hover:text-secondary-900 transition-colors"
                      title="تعديل البيانات"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>

                    {/* Change password */}
                    <button
                      onClick={() => onChangePassword(u)}
                      className="p-1.5 rounded-lg hover:bg-warning-50 text-warning-600 hover:text-warning-700 transition-colors"
                      title="تغيير كلمة المرور"
                    >
                      <Lock className="w-4 h-4" />
                    </button>

                    {/* Toggle active */}
                    <button
                      onClick={() => onToggleActive(u)}
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
  );
}
