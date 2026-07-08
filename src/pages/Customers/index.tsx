import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { type Customer, MARITAL_STATUS_LABELS } from '../../lib/supabase';
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  X,
  User as UserIcon,
  Phone,
  MapPin,
  ChevronLeft,
  ChevronRight,
  Users
} from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { customerSchema, type CustomerFormData } from './types';
import {
  fetchAgentsForCurrentUser, fetchCustomersPage, updateCustomer,
  createCustomer, computeDeletableCustomerIds, deleteCustomer,
} from './services/customersService';

export function Customers() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [agents, setAgents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletableIds, setDeletableIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const searchQuery = searchParams.get('search') || '';
  const [localSearch, setLocalSearch] = useState(searchQuery);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<CustomerFormData>({
    resolver: zodResolver(customerSchema)
  });

  useEffect(() => {
    if (user) {
      loadCustomers();
      loadAgents();
    }
  }, [user, page, searchQuery]);

  const loadAgents = async () => {
    if (!user) return;
    try {
      setAgents(await fetchAgentsForCurrentUser(user));
    } catch (error) {
      console.error('Error loading agents:', error);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== searchQuery) {
        if (localSearch) {
          setSearchParams({ search: localSearch });
        } else {
          setSearchParams({});
        }
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch]);

  const loadCustomers = async () => {
    setLoading(true);
    try {
      const { customers: pageCustomers, totalPages: pages } = await fetchCustomersPage({ page, searchQuery });

      setCustomers(pageCustomers);
      setTotalPages(pages);

      await checkDeletableCustomers(pageCustomers || []);
    } catch (error) {
      console.error('Error loading customers:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (customer?: Customer) => {
    if (customer) {
      setEditingCustomer(customer);
      reset({
        name: customer.name,
        national_id: customer.national_id || '',
        phone: customer.phone || '',
        address: customer.address || '',
        birth_date: customer.birth_date || '',
        occupation: customer.occupation || '',
        marital_status: customer.marital_status || undefined,
        owner_id: customer.owner_id || '',
        isManagerRole: !!user && user.role !== 'agent' && user.role !== 'premium_agent'
      });
    } else {
      setEditingCustomer(null);
      const isAgent = user?.role === 'agent' || user?.role === 'premium_agent';
      reset({
        name: '',
        national_id: '',
        phone: '',
        address: '',
        birth_date: '',
        occupation: '',
        marital_status: undefined,
        owner_id: isAgent ? user?.id : '',
        isManagerRole: !isAgent
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingCustomer(null);
    reset();
  };

  const onSubmit = async (data: CustomerFormData) => {
    if (!user) return;
    setSaving(true);

    // owner_id: للوكيل = نفسه دائماً، للمدير = الوكيل المختار من فريقه (مُتحقق منه بالـ schema)
    const isAgent = user.role === 'agent' || user.role === 'premium_agent';
    const finalOwnerId = isAgent ? user.id : data.owner_id;

    try {
      if (editingCustomer) {
        await updateCustomer(editingCustomer.id, data, finalOwnerId, editingCustomer);
      } else {
        await createCustomer(data, finalOwnerId);
      }

      handleCloseModal();
      loadCustomers();
    } catch (error: any) {
      console.error('Error saving customer:', error);
      if (error.code === '23505') {
        alert('الرقم القومي مسجل مسبقاً');
      } else {
        alert('حدث خطأ أثناء الحفظ');
      }
    } finally {
      setSaving(false);
    }
  };

  const checkDeletableCustomers = async (customerList: Customer[]) => {
    try {
      setDeletableIds(await computeDeletableCustomerIds(customerList));
    } catch (error) {
      console.error('Error checking deletable customers:', error);
      setDeletableIds(new Set());
    }
  };

  const handleDelete = async (id: string) => {
    setDeleting(true);
    try {
      const { error } = await deleteCustomer(id);

      if (error) {
        alert(error);
        return;
      }

      setDeleteConfirm(null);
      loadCustomers();
    } catch (error) {
      console.error('Error deleting customer:', error);
      alert('حدث خطأ أثناء الحذف');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-secondary-900">العملاء</h2>
          <p className="text-sm text-secondary-500 mt-1">إدارة بيانات العملاء</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn btn-primary"
        >
          <Plus className="w-5 h-5" />
          <span>إضافة عميل</span>
        </button>
      </div>

      <div className="card">
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="flex-1">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
              <input
                type="text"
                value={localSearch}
                onChange={(e) => setLocalSearch(e.target.value)}
                placeholder="بحث بالاسم أو الرقم القومي أو الهاتف..."
                className="input-field pr-10"
              />
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : customers.length === 0 ? (
          <div className="text-center py-12">
            <Users className="w-16 h-16 text-secondary-300 mx-auto mb-4" />
            <p className="text-secondary-500">لا يوجد عملاء</p>
            <button
              onClick={() => handleOpenModal()}
              className="btn btn-outline mt-4"
            >
              إضافة عميل جديد
            </button>
          </div>
        ) : (
          <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>الاسم</th>
                    <th>الرقم القومي</th>
                    <th>الهاتف</th>
                    <th>العنوان</th>
                    <th>تاريخ الميلاد</th>
                    <th>المهنة</th>
                    <th>الحالة الاجتماعية</th>
                    <th>المسؤول</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((customer) => (
                    <tr key={customer.id}>
                      <td className="font-medium">{customer.name}</td>
                      <td dir="ltr" className="text-left">{customer.national_id || '-'}</td>
                      <td dir="ltr" className="text-left">{customer.phone || '-'}</td>
                      <td>{customer.address || '-'}</td>
                      <td>
                        {customer.birth_date
                          ? format(new Date(customer.birth_date), 'dd/MM/yyyy')
                          : '-'}
                      </td>
                      <td>{customer.occupation || '-'}</td>
                      <td>
                        {customer.marital_status
                          ? MARITAL_STATUS_LABELS[customer.marital_status]
                          : '-'}
                      </td>
                      <td>{(customer as any).owner?.name || '-'}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenModal(customer)}
                            className="p-1.5 rounded-lg hover:bg-secondary-100 text-secondary-600 hover:text-secondary-900"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {deletableIds.has(customer.id) ? (
                            <button
                              onClick={() => setDeleteConfirm(customer.id)}
                              className="p-1.5 rounded-lg hover:bg-error-50 text-secondary-400 hover:text-error-600"
                              title="حذف العميل"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              disabled
                              className="p-1.5 rounded-lg text-secondary-200 cursor-not-allowed"
                              title="لا يمكن الحذف: يوجد وثائق مرتبطة بهذا العميل"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
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
            className="modal-content animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-secondary-200">
              <h3 className="text-lg font-semibold text-secondary-900">
                {editingCustomer ? 'تعديل العميل' : 'إضافة عميل جديد'}
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
                <div className="relative">
                  <input
                    {...register('name')}
                    className={clsx('input-field', errors.name && 'border-error-500')}
                    placeholder="أدخل اسم العميل"
                  />
                  <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                </div>
                {errors.name && (
                  <p className="text-sm text-error-600 mt-1">{errors.name.message}</p>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="input-label">الرقم القومي</label>
                  <input
                    {...register('national_id')}
                    className="input-field"
                    placeholder="أدخل الرقم القومي"
                    dir="ltr"
                  />
                </div>

                <div className="form-group">
                  <label className="input-label">رقم الهاتف</label>
                  <div className="relative">
                    <input
                      {...register('phone')}
                      className="input-field pl-10"
                      placeholder="01xxxxxxxxx"
                      dir="ltr"
                    />
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                  </div>
                </div>
              </div>

              <div className="form-group">
                <label className="input-label">العنوان</label>
                <div className="relative">
                  <input
                    {...register('address')}
                    className="input-field"
                    placeholder="أدخل العنوان"
                  />
                  <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="input-label">تاريخ الميلاد</label>
                  <input
                    {...register('birth_date')}
                    type="date"
                    className="input-field"
                  />
                </div>

                <div className="form-group">
                  <label className="input-label">المهنة</label>
                  <input
                    {...register('occupation')}
                    className="input-field"
                    placeholder="أدخل المهنة"
                  />
                </div>
              </div>

              <div className="form-group">
                <label className="input-label">الحالة الاجتماعية</label>
                <select {...register('marital_status')} className="input-field">
                  <option value="">اختر الحالة</option>
                  {Object.entries(MARITAL_STATUS_LABELS).map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>

              {user && user.role !== 'agent' && user.role !== 'premium_agent' && (
                <div className="form-group">
                  <label className="input-label">الوكيل المسؤول *</label>
                  <select
                    {...register('owner_id')}
                    className={clsx('input-field', errors.owner_id && 'border-error-500')}
                  >
                    <option value="">اختر الوكيل</option>
                    {agents.map((agent) => (
                      <option key={agent.id} value={agent.id}>
                        {agent.name}{agent.id === user.id ? ' (أنا)' : ''}
                      </option>
                    ))}
                  </select>
                  {agents.length === 0 && (
                    <p className="text-xs text-secondary-400 mt-1">لا يوجد أعضاء في فريقك حالياً</p>
                  )}
                  {errors.owner_id && (
                    <p className="text-sm text-error-600 mt-1">{errors.owner_id.message}</p>
                  )}
                </div>
              )}

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

      {deleteConfirm && (
        <div className="modal-overlay" onClick={() => setDeleteConfirm(null)}>
          <div
            className="modal-content max-w-sm animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-error-100 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-error-600" />
              </div>
              <h3 className="text-lg font-semibold text-secondary-900 mb-2">
                تأكيد الحذف
              </h3>
              <p className="text-secondary-600 mb-6">
                هل أنت متأكد من حذف هذا العميل؟ لا يمكن التراجع عن هذا الإجراء.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="btn btn-secondary"
                  disabled={deleting}
                >
                  إلغاء
                </button>
                <button
                  onClick={() => handleDelete(deleteConfirm)}
                  className="btn btn-error"
                  disabled={deleting}
                >
                  {deleting ? 'جاري الحذف...' : 'حذف'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
