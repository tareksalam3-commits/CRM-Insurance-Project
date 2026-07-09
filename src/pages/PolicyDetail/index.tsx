import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import {
  POLICY_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  POLICY_STATUS_LABELS,
  INSTALLMENT_STATUS_LABELS,
} from '../../lib/supabase';
import {
  ChevronRight,
  FileText,
  Calendar,
  CreditCard,
  CheckCircle,
  Clock,
  AlertTriangle,
  X,
  User,
  DollarSign,
  Edit2,
  Pause,
  RotateCcw,
  XCircle,
  Trash2,
} from 'lucide-react';
import clsx from 'clsx';
import { format, startOfMonth } from 'date-fns';
import { ar } from 'date-fns/locale';

import type { InstallmentWithPayment, PolicyWithRelations } from './types';
import {
  fetchPolicyById, fetchInstallmentsByPolicyId, payInstallment,
  changePolicyStatus, checkPolicyDeletable, deletePolicySafe,
} from './services/policyDetailService';
import {
  canPay, isEarlyPayment, computeInstallmentStats,
  getInstallmentBadgeClass, getPolicyStatusBadgeClass,
} from './business/installmentHelpers';

export function PolicyDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();

  // ===================================
  // حالات المكون
  // ===================================
  const [policy, setPolicy] = useState<PolicyWithRelations | null>(null);
  const [installments, setInstallments] = useState<InstallmentWithPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingInstallments, setLoadingInstallments] = useState(false);

  // سداد
  const [showPayModal, setShowPayModal] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<InstallmentWithPayment | null>(null);
  const [paymentDateStr, setPaymentDateStr] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [processingPayment, setProcessingPayment] = useState(false);

  // إجراءات الوثيقة (إيقاف/إعادة تفعيل/إلغاء/حذف) — نفس أزرار صفحة الوثائق
  const [isDeletable, setIsDeletable] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);

  // ===================================
  // تحميل بيانات الوثيقة
  // ===================================
  useEffect(() => {
    if (id && user) {
      loadPolicy();
    }
  }, [id, user]);

  const loadPolicy = async () => {
    setLoading(true);
    try {
      if (!id) return;
      const data = await fetchPolicyById(id);
      setPolicy(data);
      await loadInstallments();
      setIsDeletable(await checkPolicyDeletable(id));
    } catch (error) {
      console.error('Error loading policy:', error);
      navigate('/policies');
    } finally {
      setLoading(false);
    }
  };

  // ===================================
  // تحميل الأقساط
  // ===================================
  const loadInstallments = async () => {
    if (!id) return;
    setLoadingInstallments(true);
    try {
      setInstallments(await fetchInstallmentsByPolicyId(id));
    } catch (error) {
      console.error('Error loading installments:', error);
    } finally {
      setLoadingInstallments(false);
    }
  };

  // ===================================
  // فتح مودال السداد
  // ===================================
  const handleOpenPayModal = (installment: InstallmentWithPayment) => {
    setSelectedInstallment(installment);
    setPaymentDateStr(format(new Date(), 'yyyy-MM-dd'));
    setShowPayModal(true);
  };

  // ===================================
  // تنفيذ السداد (يدعم السداد المبكر واختيار تاريخ السداد الفعلي)
  // ===================================
  const handleProcessPayment = async () => {
    if (!selectedInstallment || !user) return;
    setProcessingPayment(true);

    try {
      await payInstallment(selectedInstallment, user.id, new Date(paymentDateStr));

      setShowPayModal(false);
      setSelectedInstallment(null);
      // إعادة تحميل الأقساط لتحديث الحالة
      await loadInstallments();
    } catch (error: any) {
      console.error('Error processing payment:', error);
      alert(error?.message || 'حدث خطأ أثناء تسجيل السداد، حاول مرة أخرى');
    } finally {
      setProcessingPayment(false);
    }
  };

  // ===================================
  // تغيير حالة الوثيقة (إيقاف / إعادة تفعيل / إلغاء)
  // ===================================
  const handleChangeStatus = async (newStatus: 'active' | 'suspended' | 'cancelled') => {
    if (!policy) return;
    setChangingStatus(true);
    try {
      await changePolicyStatus(policy, newStatus);
      await loadPolicy();
    } catch (error) {
      console.error('Error changing policy status:', error);
      alert('حدث خطأ أثناء تغيير الحالة');
    } finally {
      setChangingStatus(false);
    }
  };

  // ===================================
  // حذف الوثيقة
  // ===================================
  const handleDeletePolicy = async () => {
    if (!policy) return;
    setDeleting(true);
    try {
      const { error } = await deletePolicySafe(policy.id);
      if (error) {
        alert(error);
        return;
      }
      navigate('/policies');
    } catch (error) {
      console.error('Error deleting policy:', error);
      alert('حدث خطأ أثناء حذف الوثيقة');
    } finally {
      setDeleting(false);
    }
  };

  // ===================================
  // أيقونة وألوان حالة القسط
  // ===================================
  const getInstallmentStatusIcon = (status: string) => {
    switch (status) {
      case 'paid':
        return <CheckCircle className="w-4 h-4 text-success-600" />;
      case 'overdue':
        return <AlertTriangle className="w-4 h-4 text-error-600" />;
      default:
        return <Clock className="w-4 h-4 text-secondary-400" />;
    }
  };

  // ===================================
  // إحصائيات الأقساط
  // ===================================
  const stats = computeInstallmentStats(installments);

  // ===================================
  // شاشة التحميل
  // ===================================
  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
      </div>
    );
  }

  if (!policy) return null;

  // ===================================
  // الواجهة
  // ===================================
  return (
    <div className="space-y-6 animate-fadeIn" dir="rtl">

      {/* ===== رأس الصفحة ===== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/policies')}
            className="p-2 rounded-lg hover:bg-secondary-100 text-secondary-600"
            title="رجوع"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div>
            <h2 className="text-xl font-bold text-secondary-900">
              تفاصيل الوثيقة — {policy.policy_number}
            </h2>
            <p className="text-sm text-secondary-500 mt-0.5">
              عرض الأقساط وسداد الوثيقة
            </p>
          </div>
        </div>

        {/* ===== إجراءات الوثيقة — نفس أزرار صفحة الوثائق، متاحة هنا كمان ===== */}
        <div className="flex items-center gap-1 flex-wrap">
          <button
            onClick={() => navigate(`/policies?edit=${policy.id}`)}
            className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-secondary-100 text-secondary-600 hover:text-secondary-900"
            title="تعديل"
          >
            <Edit2 className="w-4 h-4" />
            <span className="text-xs whitespace-nowrap">تعديل</span>
          </button>
          {policy.status === 'active' && (
            <button
              onClick={() => handleChangeStatus('suspended')}
              disabled={changingStatus}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-warning-50 text-warning-600 hover:text-warning-700 disabled:opacity-50"
              title="إيقاف"
            >
              <Pause className="w-4 h-4" />
              <span className="text-xs whitespace-nowrap">إيقاف</span>
            </button>
          )}
          {(policy.status === 'suspended' || policy.status === 'cancelled') && (
            <button
              onClick={() => handleChangeStatus('active')}
              disabled={changingStatus}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-success-50 text-success-600 hover:text-success-700 disabled:opacity-50"
              title="إعادة تفعيل"
            >
              <RotateCcw className="w-4 h-4" />
              <span className="text-xs whitespace-nowrap">إعادة تفعيل</span>
            </button>
          )}
          {policy.status !== 'cancelled' && (
            <button
              onClick={() => handleChangeStatus('cancelled')}
              disabled={changingStatus}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-error-50 text-error-600 hover:text-error-700 disabled:opacity-50"
              title="إلغاء"
            >
              <XCircle className="w-4 h-4" />
              <span className="text-xs whitespace-nowrap">إلغاء</span>
            </button>
          )}
          {isDeletable ? (
            <button
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg hover:bg-error-50 text-secondary-500 hover:text-error-600"
              title="حذف الوثيقة"
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-xs whitespace-nowrap">حذف</span>
            </button>
          ) : (
            <button
              disabled
              className="flex items-center gap-1 px-2 py-1.5 rounded-lg text-secondary-200 cursor-not-allowed"
              title="لا يمكن الحذف: توجد دفعات من شهور سابقة"
            >
              <Trash2 className="w-4 h-4" />
              <span className="text-xs whitespace-nowrap">حذف</span>
            </button>
          )}
        </div>
      </div>

      {/* ===== بيانات الوثيقة ===== */}
      <div className="card">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary-100 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary-600" />
            </div>
            <div>
              <h3 className="font-semibold text-secondary-900">{policy.policy_number}</h3>
              <p className="text-sm text-secondary-500">
                {POLICY_TYPE_LABELS[policy.policy_type]}
              </p>
            </div>
          </div>
          <span className={clsx('badge', getPolicyStatusBadgeClass(policy.status))}>
            {POLICY_STATUS_LABELS[policy.status]}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
          <div>
            <p className="text-secondary-500 mb-1 flex items-center gap-1">
              <User className="w-3.5 h-3.5" /> العميل
            </p>
            <p className="font-medium text-secondary-900">{policy.customer?.name || '—'}</p>
          </div>
          <div>
            <p className="text-secondary-500 mb-1 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" /> تاريخ البداية
            </p>
            <p className="font-medium text-secondary-900">
              {format(new Date(policy.start_date), 'dd/MM/yyyy')}
            </p>
          </div>
          <div>
            <p className="text-secondary-500 mb-1 flex items-center gap-1">
              <CreditCard className="w-3.5 h-3.5" /> طريقة السداد
            </p>
            <p className="font-medium text-secondary-900">
              {PAYMENT_METHOD_LABELS[policy.payment_method]}
            </p>
          </div>
          <div>
            <p className="text-secondary-500 mb-1 flex items-center gap-1">
              <DollarSign className="w-3.5 h-3.5" /> قيمة القسط
            </p>
            <p className="font-medium text-secondary-900">
              {new Intl.NumberFormat('ar-EG', {
                style: 'currency',
                currency: 'EGP',
                minimumFractionDigits: 0,
              }).format(policy.premium_amount)}
            </p>
          </div>
        </div>
      </div>

      {/* ===== إحصائيات الأقساط ===== */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'إجمالي الأقساط', value: stats.total, color: 'text-secondary-700', bg: 'bg-secondary-100' },
          { label: 'مسدد',           value: stats.paid,   color: 'text-success-700',   bg: 'bg-success-50' },
          { label: 'غير مسدد',       value: stats.pending, color: 'text-secondary-600', bg: 'bg-secondary-50' },
          { label: 'متأخر',          value: stats.overdue, color: 'text-error-700',     bg: 'bg-error-50' },
        ].map((s) => (
          <div key={s.label} className={clsx('card text-center py-4', s.bg)}>
            <p className={clsx('text-2xl font-bold', s.color)}>{s.value}</p>
            <p className="text-xs text-secondary-500 mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* ===== جدول الأقساط ===== */}
      <div className="card">
        <h3 className="font-semibold text-secondary-900 mb-4 flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-primary-600" />
          جدول الأقساط
        </h3>

        {loadingInstallments ? (
          <div className="flex items-center justify-center h-32">
            <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
          </div>
        ) : installments.length === 0 ? (
          <p className="text-center text-secondary-500 py-8">لا توجد أقساط لهذه الوثيقة</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>رقم القسط</th>
                  <th>تاريخ الاستحقاق</th>
                  <th>المبلغ</th>
                  <th>الحالة</th>
                  <th>تاريخ السداد</th>
                  <th>إجراء</th>
                </tr>
              </thead>
              <tbody>
                {installments.map((inst) => (
                  <tr key={inst.id}>

                    {/* رقم القسط + شارة "إنتاج جديد" للقسط الأول */}
                    <td>
                      <div className="flex items-center gap-2">
                        <span className="font-medium">{inst.installment_number}</span>
                        {inst.is_first && (
                          <span className="badge badge-primary text-xs">إنتاج جديد</span>
                        )}
                      </div>
                    </td>

                    {/* تاريخ الاستحقاق + علامة مبكر إن كان مستقبلياً */}
                    <td>
                      <div className="flex items-center gap-1.5">
                        {format(new Date(inst.due_date), 'dd/MM/yyyy')}
                        {isEarlyPayment(inst) && (
                          <span className="badge bg-blue-100 text-blue-700 text-xs">
                            مبكر
                          </span>
                        )}
                      </div>
                    </td>

                    {/* المبلغ */}
                    <td>
                      {new Intl.NumberFormat('ar-EG', {
                        style: 'currency',
                        currency: 'EGP',
                        minimumFractionDigits: 0,
                      }).format(inst.amount)}
                    </td>

                    {/* الحالة */}
                    <td>
                      <div className="flex items-center gap-1.5">
                        {getInstallmentStatusIcon(inst.status)}
                        <span className={clsx('badge', getInstallmentBadgeClass(inst.status))}>
                          {INSTALLMENT_STATUS_LABELS[inst.status]}
                        </span>
                      </div>
                    </td>

                    {/* تاريخ السداد الفعلي */}
                    <td>
                      {inst.paid_at
                        ? format(new Date(inst.paid_at), 'dd/MM/yyyy HH:mm', { locale: ar })
                        : '—'}
                    </td>

                    {/* زر السداد */}
                    <td>
                      {canPay(inst) && policy.status === 'active' ? (
                        <button
                          onClick={() => handleOpenPayModal(inst)}
                          className="btn btn-primary btn-sm"
                        >
                          <CreditCard className="w-3.5 h-3.5" />
                          <span>سداد</span>
                          {isEarlyPayment(inst) && (
                            <span className="text-xs opacity-75">(مبكر)</span>
                          )}
                        </button>
                      ) : inst.status === 'paid' ? (
                        <span className="text-success-600 text-sm flex items-center gap-1">
                          <CheckCircle className="w-4 h-4" /> مسدد
                        </span>
                      ) : (
                        <span className="text-secondary-400 text-sm">—</span>
                      )}
                    </td>

                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ===== مودال تأكيد السداد ===== */}
      {showPayModal && selectedInstallment && (
        <div className="modal-overlay" onClick={() => setShowPayModal(false)}>
          <div
            className="modal-content max-w-md animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            {/* رأس المودال */}
            <div className="flex items-center justify-between p-6 border-b border-secondary-200">
              <h3 className="text-lg font-semibold text-secondary-900">تأكيد السداد</h3>
              <button
                onClick={() => setShowPayModal(false)}
                className="p-2 rounded-lg hover:bg-secondary-100"
              >
                <X className="w-5 h-5 text-secondary-600" />
              </button>
            </div>

            {/* محتوى المودال */}
            <div className="p-6 space-y-4">

              {/* تنبيه السداد المبكر */}
              {isEarlyPayment(selectedInstallment) && (
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 flex items-start gap-2">
                  <AlertTriangle className="w-4 h-4 text-blue-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-blue-700">سداد مبكر</p>
                    <p className="text-xs text-blue-600 mt-0.5">
                      تاريخ استحقاق هذا القسط{' '}
                      {format(new Date(selectedInstallment.due_date), 'dd/MM/yyyy')} — سيُسجَّل
                      السداد في شهر{' '}
                      {format(startOfMonth(new Date(paymentDateStr)), 'MMMM yyyy', { locale: ar })}.
                    </p>
                  </div>
                </div>
              )}

              {/* تاريخ السداد الفعلي — يحدد شهر التارجت اللي هيتحسب عليه */}
              <div className="form-group">
                <label className="input-label">تاريخ السداد</label>
                <input
                  type="date"
                  value={paymentDateStr}
                  max={format(new Date(), 'yyyy-MM-dd')}
                  onChange={(e) => setPaymentDateStr(e.target.value)}
                  className="input-field"
                />
                <p className="text-xs text-secondary-400 mt-1">
                  سيُحسب السداد ضمن تارجت شهر{' '}
                  {format(startOfMonth(new Date(paymentDateStr)), 'MMMM yyyy', { locale: ar })}
                </p>
              </div>

              {/* تفاصيل السداد */}
              <div className="bg-secondary-50 rounded-xl p-4 space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-secondary-500">رقم القسط</span>
                  <span className="font-medium">{selectedInstallment.installment_number}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-secondary-500">تاريخ الاستحقاق</span>
                  <span className="font-medium">
                    {format(new Date(selectedInstallment.due_date), 'dd/MM/yyyy')}
                  </span>
                </div>
                <div className="flex justify-between text-sm border-t border-secondary-200 pt-3">
                  <span className="text-secondary-700 font-semibold">المبلغ المستحق</span>
                  <span className="font-bold text-primary-700 text-base">
                    {new Intl.NumberFormat('ar-EG', {
                      style: 'currency',
                      currency: 'EGP',
                      minimumFractionDigits: 0,
                    }).format(selectedInstallment.amount)}
                  </span>
                </div>
              </div>
            </div>

            {/* أزرار المودال */}
            <div className="flex justify-end gap-3 px-6 pb-6">
              <button
                onClick={() => setShowPayModal(false)}
                className="btn btn-secondary"
                disabled={processingPayment}
              >
                إلغاء
              </button>
              <button
                onClick={handleProcessPayment}
                disabled={processingPayment}
                className="btn btn-primary"
              >
                {processingPayment ? (
                  <>
                    <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                    <span>جاري التسجيل...</span>
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4" />
                    <span>تأكيد السداد</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال تأكيد حذف الوثيقة ===== */}
      {showDeleteConfirm && (
        <div className="modal-overlay" onClick={() => setShowDeleteConfirm(false)}>
          <div className="modal-content max-w-sm animate-fadeIn" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 text-center">
              <div className="w-12 h-12 rounded-full bg-error-100 flex items-center justify-center mx-auto mb-4">
                <Trash2 className="w-6 h-6 text-error-600" />
              </div>
              <h3 className="text-lg font-semibold text-secondary-900 mb-2">
                تأكيد حذف الوثيقة
              </h3>
              <p className="text-secondary-600 mb-2">
                هل أنت متأكد من حذف الوثيقة رقم{' '}
                <span className="font-medium text-secondary-900">{policy.policy_number}</span>؟
              </p>
              <p className="text-sm text-warning-600 mb-6">
                لا يمكن التراجع عن هذا الإجراء، وسيتم حذف كل الأقساط المرتبطة بها.
              </p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setShowDeleteConfirm(false)}
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
