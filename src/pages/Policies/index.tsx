import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  Policy,
  Customer,
  POLICY_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  POLICY_STATUS_LABELS,
  PolicyType,
  PaymentMethod
} from '../../lib/supabase';
import {
  Plus,
  Search,
  Edit2,
  X,
  FileText,
  ChevronLeft,
  ChevronRight,
  Pause,
  XCircle,
  RotateCcw,
  Trash2
} from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';

import { policySchema, type PolicyFormData } from './types';
import {
  fetchPoliciesPage, fetchCustomersForDropdown, countPaidInstallments,
  updatePolicy, createPolicy, computeDeletablePolicyIds, deletePolicySafe, changePolicyStatus,
} from './services/policiesService';

export function Policies() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<Policy | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<Policy | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deletableIds, setDeletableIds] = useState<Set<string>>(new Set());
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const searchQuery = searchParams.get('search') || '';
  const [localSearch, setLocalSearch] = useState(searchQuery);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors }
  } = useForm<PolicyFormData>({
    resolver: zodResolver(policySchema)
  });

  useEffect(() => {
    if (user) {
      loadPolicies();
      loadCustomers();
    }
  }, [user, page, searchQuery, statusFilter]);

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

  const loadPolicies = async () => {
    setLoading(true);
    try {
      const { policies: pagePolicies, totalPages: pages } = await fetchPoliciesPage({ page, searchQuery, statusFilter });

      setPolicies(pagePolicies);
      setTotalPages(pages);

      await checkDeletablePolicies(pagePolicies || []);
    } catch (error) {
      console.error('Error loading policies:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadCustomers = async () => {
    setCustomers(await fetchCustomersForDropdown());
  };

  const handleOpenModal = (policy?: Policy) => {
    if (policy) {
      setEditingPolicy(policy);
      reset({
        policy_number: policy.policy_number,
        customer_id: policy.customer_id,
        policy_type: policy.policy_type as PolicyType,
        start_date: policy.start_date,
        payment_method: policy.payment_method as PaymentMethod,
        premium_amount: policy.premium_amount,
        notes: policy.notes || ''
      });
    } else {
      setEditingPolicy(null);
      reset({
        policy_number: '',
        customer_id: '',
        policy_type: 'quadruple',
        start_date: format(new Date(), 'yyyy-MM-dd'),
        payment_method: 'monthly',
        premium_amount: '' as any,
        notes: ''
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingPolicy(null);
    reset();
  };

  const onSubmit = async (data: PolicyFormData) => {
    if (!user) return;
    setSaving(true);

    try {
      if (editingPolicy) {
        const oldData = editingPolicy;

        const fieldsAffectingInstallments =
          data.premium_amount !== Number(oldData.premium_amount) ||
          data.payment_method !== oldData.payment_method ||
          data.start_date !== oldData.start_date;

        if (fieldsAffectingInstallments) {
          const paidCount = await countPaidInstallments(editingPolicy.id);

          if (paidCount > 0) {
            const confirmed = window.confirm(
              `تنبيه: يوجد ${paidCount} قسط مدفوع مسبقاً في هذه الوثيقة بالقيمة/الموعد القديم.\n\n` +
              `تعديل قيمة القسط أو طريقة السداد أو تاريخ البداية لن يغيّر الأقساط المدفوعة بالفعل (لحماية السجل المالي) — التعديل سيُطبَّق فقط على الأقساط القادمة (غير المسددة).\n\n` +
              `هل تريد المتابعة؟`
            );
            if (!confirmed) {
              setSaving(false);
              return;
            }
          }
        }

        await updatePolicy(editingPolicy.id, data, oldData);
      } else {
        const selectedCustomer = customers.find((c) => c.id === data.customer_id);
        const policyOwnerId = selectedCustomer?.owner_id || user.id;

        await createPolicy(data, policyOwnerId);
      }

      handleCloseModal();
      loadPolicies();
    } catch (error: any) {
      console.error('Error saving policy:', error);
      const msg: string = error?.message || '';
      if (error.code === '23505' && msg.includes('policy_number')) {
        alert('رقم الوثيقة مسجل مسبقاً');
      } else if (error.code === '23505') {
        alert('حدث تعارض في البيانات أثناء الحفظ، برجاء المحاولة مرة أخرى');
      } else {
        alert('حدث خطأ أثناء الحفظ');
      }
    } finally {
      setSaving(false);
    }
  };

  const checkDeletablePolicies = async (policyList: Policy[]) => {
    try {
      setDeletableIds(await computeDeletablePolicyIds(policyList));
    } catch (error) {
      console.error('Error checking deletable policies:', error);
      setDeletableIds(new Set());
    }
  };

  const handleDeletePolicy = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const { error } = await deletePolicySafe(deleteConfirm.id, deleteConfirm);

      if (error) {
        alert(error);
        return;
      }

      setDeleteConfirm(null);
      loadPolicies();
    } catch (error) {
      console.error('Error deleting policy:', error);
      alert('حدث خطأ أثناء حذف الوثيقة');
    } finally {
      setDeleting(false);
    }
  };

  const handleStatusChange = async (policy: Policy, newStatus: 'active' | 'suspended' | 'cancelled') => {
    try {
      await changePolicyStatus(policy, newStatus);
      loadPolicies();
    } catch (error) {
      console.error('Error changing policy status:', error);
      alert('حدث خطأ أثناء تغيير الحالة');
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'active':
        return 'badge-success';
      case 'suspended':
        return 'badge-warning';
      case 'cancelled':
        return 'badge-error';
      default:
        return 'badge-secondary';
    }
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-secondary-900">الوثائق</h2>
          <p className="text-sm text-secondary-500 mt-1">إدارة وثائق التأمين</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="btn btn-primary"
        >
          <Plus className="w-5 h-5" />
          <span>إصدار وثيقة</span>
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
                placeholder="بحث برقم الوثيقة أو اسم العميل..."
                className="input-field pr-10"
              />
            </div>
          </div>
          <select
            value={statusFilter}
            onChange={(e) => {
              setStatusFilter(e.target.value);
              setPage(1);
            }}
            className="input-field w-auto"
          >
            <option value="all">جميع الحالات</option>
            <option value="active">نشط</option>
            <option value="suspended">موقوف</option>
            <option value="cancelled">ملغى</option>
          </select>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : policies.length === 0 ? (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-secondary-300 mx-auto mb-4" />
            <p className="text-secondary-500">لا توجد وثائق</p>
            <button
              onClick={() => handleOpenModal()}
              className="btn btn-outline mt-4"
            >
              إصدار وثيقة جديدة
            </button>
          </div>
        ) : (
          <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>رقم الوثيقة</th>
                    <th>العميل</th>
                    <th>نوع الوثيقة</th>
                    <th>تاريخ البداية</th>
                    <th>طريقة السداد</th>
                    <th>قيمة القسط</th>
                    <th>الحالة</th>
                    <th>المسؤول</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((policy) => (
                    <tr key={policy.id}>
                      <td className="font-medium">{policy.policy_number}</td>
                      <td>{(policy as any).customer?.name || '-'}</td>
                      <td>{POLICY_TYPE_LABELS[policy.policy_type]}</td>
                      <td>{format(new Date(policy.start_date), 'dd/MM/yyyy')}</td>
                      <td>{PAYMENT_METHOD_LABELS[policy.payment_method]}</td>
                      <td>
                        {new Intl.NumberFormat('ar-EG', {
                          style: 'currency',
                          currency: 'EGP',
                          minimumFractionDigits: 0
                        }).format(policy.premium_amount)}
                      </td>
                      <td>
                        <span className={clsx('badge', getStatusBadgeClass(policy.status))}>
                          {POLICY_STATUS_LABELS[policy.status]}
                        </span>
                      </td>
                      <td>{(policy as any).owner?.name || '-'}</td>
                      <td>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleOpenModal(policy)}
                            className="p-1.5 rounded-lg hover:bg-secondary-100 text-secondary-600 hover:text-secondary-900"
                            title="تعديل"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {policy.status === 'active' && (
                            <button
                              onClick={() => handleStatusChange(policy, 'suspended')}
                              className="p-1.5 rounded-lg hover:bg-warning-50 text-warning-600 hover:text-warning-700"
                              title="إيقاف"
                            >
                              <Pause className="w-4 h-4" />
                            </button>
                          )}
                          {policy.status === 'suspended' && (
                            <button
                              onClick={() => handleStatusChange(policy, 'active')}
                              className="p-1.5 rounded-lg hover:bg-success-50 text-success-600 hover:text-success-700"
                              title="إعادة تفعيل"
                            >
                              <RotateCcw className="w-4 h-4" />
                            </button>
                          )}
                          {policy.status !== 'cancelled' && (
                            <button
                              onClick={() => handleStatusChange(policy, 'cancelled')}
                              className="p-1.5 rounded-lg hover:bg-error-50 text-error-600 hover:text-error-700"
                              title="إلغاء"
                            >
                              <XCircle className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            onClick={() => navigate(`/policies/${policy.id}`)}
                            className="p-1.5 rounded-lg hover:bg-primary-50 text-primary-600 hover:text-primary-700"
                            title="عرض التفاصيل"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                          {deletableIds.has(policy.id) ? (
                            <button
                              onClick={() => setDeleteConfirm(policy)}
                              className="p-1.5 rounded-lg hover:bg-error-50 text-secondary-400 hover:text-error-600"
                              title="حذف الوثيقة"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : (
                            <button
                              disabled
                              className="p-1.5 rounded-lg text-secondary-200 cursor-not-allowed"
                              title="لا يمكن الحذف: توجد دفعات من شهور سابقة"
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
            className="modal-content max-w-2xl animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-secondary-200">
              <h3 className="text-lg font-semibold text-secondary-900">
                {editingPolicy ? 'تعديل الوثيقة' : 'إصدار وثيقة جديدة'}
              </h3>
              <button
                onClick={handleCloseModal}
                className="p-2 rounded-lg hover:bg-secondary-100"
              >
                <X className="w-5 h-5 text-secondary-600" />
              </button>
            </div>

            <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="input-label">رقم الوثيقة *</label>
                  <input
                    {...register('policy_number')}
                    className={clsx('input-field', errors.policy_number && 'border-error-500')}
                    placeholder="أدخل رقم الوثيقة"
                  />
                  {errors.policy_number && (
                    <p className="text-sm text-error-600 mt-1">{errors.policy_number.message}</p>
                  )}
                </div>

                <div className="form-group">
                  <label className="input-label">العميل *</label>
                  <select
                    {...register('customer_id')}
                    className={clsx('input-field', errors.customer_id && 'border-error-500')}
                  >
                    <option value="">اختر العميل</option>
                    {customers.map((customer) => (
                      <option key={customer.id} value={customer.id}>
                        {customer.name}
                      </option>
                    ))}
                  </select>
                  {errors.customer_id && (
                    <p className="text-sm text-error-600 mt-1">{errors.customer_id.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="input-label">نوع الوثيقة *</label>
                  <select
                    {...register('policy_type')}
                    className="input-field"
                  >
                    {Object.entries(POLICY_TYPE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="input-label">تاريخ البداية *</label>
                  <input
                    {...register('start_date')}
                    type="date"
                    className={clsx('input-field', errors.start_date && 'border-error-500')}
                  />
                  {errors.start_date && (
                    <p className="text-sm text-error-600 mt-1">{errors.start_date.message}</p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-group">
                  <label className="input-label">طريقة السداد *</label>
                  <select
                    {...register('payment_method')}
                    className="input-field"
                  >
                    {Object.entries(PAYMENT_METHOD_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label className="input-label">قيمة القسط *</label>
                  <div className="relative">
                    <input
                      {...register('premium_amount', { valueAsNumber: true })}
                      type="number"
                      min="0"
                      className={clsx('input-field pl-16', errors.premium_amount && 'border-error-500')}
                      placeholder="أدخل قيمة القسط"
                    />
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400 text-sm">
                      جنيه
                    </span>
                  </div>
                  {errors.premium_amount && (
                    <p className="text-sm text-error-600 mt-1">{errors.premium_amount.message}</p>
                  )}
                </div>
              </div>

              <div className="form-group">
                <label className="input-label">ملاحظات</label>
                <textarea
                  {...register('notes')}
                  className="input-field min-h-[80px] resize-none"
                  placeholder="أدخل ملاحظات (اختياري)"
                />
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
                  {saving ? 'جاري الحفظ...' : editingPolicy ? 'حفظ التعديلات' : 'إصدار الوثيقة'}
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
                تأكيد حذف الوثيقة
              </h3>
              <p className="text-secondary-600 mb-2">
                هل أنت متأكد من حذف الوثيقة رقم{' '}
                <span className="font-medium text-secondary-900">{deleteConfirm.policy_number}</span>؟
              </p>
              <p className="text-sm text-warning-600 mb-6">
                لا يمكن التراجع عن هذا الإجراء، وسيتم حذف كل الأقساط المرتبطة بها.
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
                  onClick={handleDeletePolicy}
                  disabled={deleting}
                  className="btn btn-error"
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
