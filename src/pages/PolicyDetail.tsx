import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  supabase,
  Policy,
  Installment,
  POLICY_TYPE_LABELS,
  PAYMENT_METHOD_LABELS,
  POLICY_STATUS_LABELS,
  INSTALLMENT_STATUS_LABELS,
} from '../lib/supabase';
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
} from 'lucide-react';
import clsx from 'clsx';
import { format, startOfMonth } from 'date-fns';
import { ar } from 'date-fns/locale';

// ===================================
// أنواع البيانات
// ===================================
type InstallmentWithPayment = Installment & {
  payments?: { id: string; is_cancelled: boolean }[];
};

type PolicyWithRelations = Policy & {
  customer: { id: string; name: string; phone?: string; national_id?: string };
  owner: { id: string; name: string };
};

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
  const [processingPayment, setProcessingPayment] = useState(false);

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
      const { data, error } = await supabase
        .from('policies')
        .select(`
          *,
          customer:customer_id(id, name, phone, national_id),
          owner:owner_id(id, name)
        `)
        .eq('id', id)
        .single();

      if (error) throw error;
      setPolicy(data as PolicyWithRelations);
      await loadInstallments();
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
      const { data, error } = await supabase
        .from('installments')
        .select(`
          *,
          payments(id, is_cancelled)
        `)
        .eq('policy_id', id)
        .order('installment_number', { ascending: true });

      if (error) throw error;
      setInstallments((data as InstallmentWithPayment[]) || []);
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
    setShowPayModal(true);
  };

  // ===================================
  // تنفيذ السداد (يدعم السداد المبكر)
  // ===================================
  const handleProcessPayment = async () => {
    if (!selectedInstallment || !user) return;
    setProcessingPayment(true);

    try {
      // payment_month = الشهر الفعلي للدفع (وليس تاريخ استحقاق القسط)
      // هذا يدعم السداد المبكر تلقائياً
      const now = new Date();
      const paymentMonth = format(startOfMonth(now), 'yyyy-MM-dd');

      const { error } = await supabase
        .from('payments')
        .insert({
          installment_id: selectedInstallment.id,
          amount: selectedInstallment.amount,
          paid_by_user_id: user.id,
          payment_month: paymentMonth,
        });

      if (error) throw error;

      // تسجيل في سجل النشاط
      await supabase.rpc('log_activity', {
        p_action: 'payment_create',
        p_entity_type: 'installment',
        p_entity_id: selectedInstallment.id,
      });

      setShowPayModal(false);
      setSelectedInstallment(null);
      // إعادة تحميل الأقساط لتحديث الحالة
      await loadInstallments();
    } catch (error) {
      console.error('Error processing payment:', error);
      alert('حدث خطأ أثناء تسجيل السداد، حاول مرة أخرى');
    } finally {
      setProcessingPayment(false);
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

  const getInstallmentBadgeClass = (status: string) => {
    switch (status) {
      case 'paid':    return 'badge-success';
      case 'overdue': return 'badge-error';
      default:        return 'badge-secondary';
    }
  };

  const getPolicyStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'active':    return 'badge-success';
      case 'suspended': return 'badge-warning';
      case 'cancelled': return 'badge-error';
      default:          return 'badge-secondary';
    }
  };

  // ===================================
  // هل القسط قابل للسداد؟
  // قسط مدفوع مسبقاً (future) أو pending/overdue = يمكن سداده
  // ===================================
  const canPay = (inst: InstallmentWithPayment) => {
    return inst.status === 'pending' || inst.status === 'overdue';
  };

  // هل هذا سداد مبكر؟ (تاريخ استحقاق في المستقبل)
  const isEarlyPayment = (inst: InstallmentWithPayment) => {
    return new Date(inst.due_date) > new Date() && inst.status === 'pending';
  };

  // ===================================
  // إحصائيات الأقساط
  // ===================================
  const stats = {
    total: installments.length,
    paid: installments.filter((i) => i.status === 'paid').length,
    pending: installments.filter((i) => i.status === 'pending').length,
    overdue: installments.filter((i) => i.status === 'overdue').length,
  };

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
                      {format(startOfMonth(new Date()), 'MMMM yyyy', { locale: ar })} الحالي.
                    </p>
                  </div>
                </div>
              )}

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
    </div>
  );
}
