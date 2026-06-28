import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import {
  supabase,
  Installment,
  Policy,
  INSTALLMENT_STATUS_LABELS
} from '../lib/supabase';
import {
  Search,
  CreditCard,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  Calendar,
  CheckCircle,
  XCircle,
  AlertTriangle,
  X
} from 'lucide-react';
import clsx from 'clsx';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ar } from 'date-fns/locale';

type TabType = 'new_production' | 'periodic' | 'overdue' | 'paid_new' | 'paid_periodic';
type InstallmentWithRelations = Installment & {
  policy: Policy & { customer: { name: string }; owner: { name: string } };
};

export function Collection() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('new_production');
  const [installments, setInstallments] = useState<InstallmentWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [searchQuery, setSearchQuery] = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<InstallmentWithRelations | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [cancelReason, setCancelReason] = useState('');
  const [showPolicyModal, setShowPolicyModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<Policy | null>(null);
  const [policyInstallments, setPolicyInstallments] = useState<InstallmentWithRelations[]>([]);
  const [loadingPolicyInstallments, setLoadingPolicyInstallments] = useState(false);
  const pageSize = 10;

  useEffect(() => {
    if (user) {
      loadInstallments();
    }
  }, [user, activeTab, page, searchQuery]);

  const loadInstallments = async () => {
    setLoading(true);
    try {
      const now = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd = endOfMonth(now);
      const monthStartStr = format(monthStart, 'yyyy-MM-dd');

      let query = supabase
        .from('installments')
        .select(`
          *,
          policy:policy_id(
            *,
            customer:customer_id(name),
            owner:owner_id(name)
          )
        `);

      switch (activeTab) {
        case 'new_production':
          query = query
            .eq('is_first', true)
            .eq('status', 'pending')
            .gte('due_date', monthStartStr)
            .lte('due_date', format(monthEnd, 'yyyy-MM-dd'));
          break;
        case 'periodic':
          query = query
            .eq('is_first', false)
            .eq('status', 'pending')
            .gte('due_date', monthStartStr)
            .lte('due_date', format(monthEnd, 'yyyy-MM-dd'));
          break;
        case 'overdue':
          query = query
            .eq('status', 'overdue');
          break;
        case 'paid_new':
          query = query
            .eq('is_first', true)
            .eq('status', 'paid');
          break;
        case 'paid_periodic':
          query = query
            .eq('is_first', false)
            .eq('status', 'paid');
          break;
      }

      if (searchQuery) {
        query = query.or(`policy.policy_number.ilike.%${searchQuery}%`);
      }

      const { data, error, count } = await query
        .order('due_date', { ascending: true })
        .range((page - 1) * pageSize, page * pageSize - 1);

      if (error) throw error;

      setInstallments(data as InstallmentWithRelations[]);
      setTotalPages(Math.ceil((count || 0) / pageSize));
    } catch (error) {
      console.error('Error loading installments:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPolicyInstallments = async (policyId: string) => {
    setLoadingPolicyInstallments(true);
    try {
      const { data, error } = await supabase
        .from('installments')
        .select(`
          *,
          policy:policy_id(
            *,
            customer:customer_id(name),
            owner:owner_id(name)
          )
        `)
        .eq('policy_id', policyId)
        .order('installment_number', { ascending: true });

      if (error) throw error;
      setPolicyInstallments(data as InstallmentWithRelations[]);
    } catch (error) {
      console.error('Error loading policy installments:', error);
      alert('حدث خطأ أثناء تحميل الأقساط');
    } finally {
      setLoadingPolicyInstallments(false);
    }
  };

  const handleOpenPolicyDetails = (policy: Policy) => {
    setSelectedPolicy(policy);
    setShowPolicyModal(true);
    loadPolicyInstallments(policy.id);
  };

  const handleOpenPayment = (installment: InstallmentWithRelations) => {
    setSelectedInstallment(installment);
    setShowPaymentModal(true);
  };

  const handleProcessPayment = async () => {
    if (!selectedInstallment || !user) return;
    setProcessingPayment(true);

    try {
      const now = new Date();
      const paymentMonth = format(startOfMonth(now), 'yyyy-MM-dd');

      const { error: paymentError } = await supabase
        .from('payments')
        .insert({
          installment_id: selectedInstallment.id,
          amount: selectedInstallment.amount,
          paid_by_user_id: user.id,
          payment_month: paymentMonth
        });

      if (paymentError) throw paymentError;

      await supabase.rpc('log_activity', {
        p_action: 'payment_create',
        p_entity_type: 'installment',
        p_entity_id: selectedInstallment.id
      });

      setShowPaymentModal(false);
      setSelectedInstallment(null);
      loadInstallments();
    } catch (error) {
      console.error('Error processing payment:', error);
      alert('حدث خطأ أثناء تسجيل السداد');
    } finally {
      setProcessingPayment(false);
    }
  };

  const handleOpenCancel = (installment: InstallmentWithRelations) => {
    setSelectedInstallment(installment);
    setShowCancelModal(true);
  };

  const handleCancelPayment = async () => {
    if (!selectedInstallment || !user) return;
    setProcessingPayment(true);

    try {
      const monthStart = format(startOfMonth(new Date(selectedInstallment.paid_at || '')), 'yyyy-MM-dd');

      const { data: isClosed } = await supabase.rpc('is_month_closed', {
        check_month: monthStart
      });

      if (isClosed) {
        alert('لا يمكن إلغاء السداد لشهر مقفل');
        return;
      }

      const { data: payment } = await supabase
        .from('payments')
        .select('id')
        .eq('installment_id', selectedInstallment.id)
        .eq('is_cancelled', false)
        .single();

      if (!payment) {
        alert('لم يتم العثور على السداد');
        return;
      }

      const { error } = await supabase
        .from('payments')
        .update({
          is_cancelled: true,
          cancelled_at: new Date().toISOString(),
          cancelled_by_user_id: user.id,
          cancel_reason: cancelReason || 'إلغاء السداد'
        })
        .eq('id', payment.id);

      if (error) throw error;

      await supabase.rpc('log_activity', {
        p_action: 'payment_cancel',
        p_entity_type: 'installment',
        p_entity_id: selectedInstallment.id
      });

      setShowCancelModal(false);
      setSelectedInstallment(null);
      setCancelReason('');
      loadInstallments();
    } catch (error) {
      console.error('Error cancelling payment:', error);
      alert('حدث خطأ أثناء إلغاء السداد');
    } finally {
      setProcessingPayment(false);
    }
  };

  const tabs = [
    { id: 'new_production', label: 'الإنتاج الجديد', icon: DollarSign },
    { id: 'periodic', label: 'التحصيل الدوري', icon: Calendar },
    { id: 'overdue', label: 'المتأخر', icon: AlertTriangle },
    { id: 'paid_new', label: 'المسدد (جديد)', icon: CheckCircle },
    { id: 'paid_periodic', label: 'المسدد (تحصيل)', icon: CheckCircle }
  ];

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency: 'EGP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-secondary-900">التحصيل والسداد</h2>
          <p className="text-sm text-secondary-500 mt-1">
            إدارة السداد للأقساط - {format(new Date(), 'MMMM yyyy', { locale: ar })}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as TabType);
                setPage(1);
              }}
              className={clsx(
                'btn',
                activeTab === tab.id
                  ? 'btn-primary'
                  : 'btn-secondary'
              )}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      <div className="card">
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setPage(1);
              }}
              placeholder="بحث برقم الوثيقة..."
              className="input-field pr-10"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : installments.length === 0 ? (
          <div className="text-center py-12">
            <CreditCard className="w-16 h-16 text-secondary-300 mx-auto mb-4" />
            <p className="text-secondary-500">لا توجد أقساط</p>
          </div>
        ) : (
          <>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>رقم الوثيقة</th>
                    <th>العميل</th>
                    <th>رقم القسط</th>
                    <th>قيمة القسط</th>
                    <th>تاريخ الاستحقاق</th>
                    <th>الحالة</th>
                    <th>تاريخ السداد</th>
                    <th>المسؤول</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {installments.map((installment) => (
                    <tr key={installment.id}>
                      <td className="font-medium">
                        {(installment.policy as any)?.policy_number}
                      </td>
                      <td>{(installment.policy as any)?.customer?.name || '-'}</td>
                      <td>
                        <span className="flex items-center gap-1">
                          {installment.installment_number}
                          {installment.is_first && (
                            <span className="badge badge-info text-[10px]">الأول</span>
                          )}
                        </span>
                      </td>
                      <td className="font-semibold">{formatCurrency(installment.amount)}</td>
                      <td>{format(new Date(installment.due_date), 'dd/MM/yyyy')}</td>
                      <td>
                        <span
                          className={clsx(
                            'badge',
                            installment.status === 'paid' ? 'badge-success' :
                            installment.status === 'overdue' ? 'badge-error' : 'badge-warning'
                          )}
                        >
                          {INSTALLMENT_STATUS_LABELS[installment.status]}
                        </span>
                      </td>
                      <td>
                        {installment.paid_at
                          ? format(new Date(installment.paid_at), 'dd/MM/yyyy')
                          : '-'}
                      </td>
                      <td>{(installment.policy as any)?.owner?.name || '-'}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleOpenPolicyDetails((installment.policy as any))}
                            className="btn btn-ghost btn-sm"
                            title="عرض جميع أقساط الوثيقة"
                          >
                            <FileText className="w-4 h-4" />
                          </button>
                          {installment.status !== 'paid' && (
                            <button
                              onClick={() => handleOpenPayment(installment)}
                              className="btn btn-primary btn-sm"
                            >
                              <CheckCircle className="w-4 h-4" />
                              <span>سداد</span>
                            </button>
                          )}
                          {installment.status === 'paid' && (
                            <button
                              onClick={() => handleOpenCancel(installment)}
                              className="btn btn-secondary btn-sm"
                            >
                              <XCircle className="w-4 h-4" />
                              <span>إلغاء</span>
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

      {showPaymentModal && selectedInstallment && (
        <div className="modal-overlay" onClick={() => setShowPaymentModal(false)}>
          <div
            className="modal-content max-w-md animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-secondary-200">
              <h3 className="text-lg font-semibold text-secondary-900">تأكيد السداد</h3>
              <button
                onClick={() => setShowPaymentModal(false)}
                className="p-2 rounded-lg hover:bg-secondary-100"
              >
                <X className="w-5 h-5 text-secondary-600" />
              </button>
            </div>

            <div className="p-6">
              <div className="bg-primary-50 rounded-lg p-4 mb-6">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-secondary-600">رقم الوثيقة</span>
                  <span className="font-semibold text-secondary-900">
                    {(selectedInstallment.policy as any)?.policy_number}
                  </span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-secondary-600">العميل</span>
                  <span className="font-semibold text-secondary-900">
                    {(selectedInstallment.policy as any)?.customer?.name}
                  </span>
                </div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-secondary-600">رقم القسط</span>
                  <span className="font-semibold text-secondary-900">
                    {selectedInstallment.installment_number}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-secondary-600">قيمة القسط</span>
                  <span className="text-xl font-bold text-primary-700">
                    {formatCurrency(selectedInstallment.amount)}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowPaymentModal(false)}
                  className="btn btn-secondary"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleProcessPayment}
                  disabled={processingPayment}
                  className="btn btn-success"
                >
                  {processingPayment ? 'جاري التسجيل...' : 'تأكيد السداد'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showCancelModal && selectedInstallment && (
        <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
          <div
            className="modal-content max-w-md animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-secondary-200">
              <h3 className="text-lg font-semibold text-secondary-900">إلغاء السداد</h3>
              <button
                onClick={() => setShowCancelModal(false)}
                className="p-2 rounded-lg hover:bg-secondary-100"
              >
                <X className="w-5 h-5 text-secondary-600" />
              </button>
            </div>

            <div className="p-6">
              <div className="bg-error-50 rounded-lg p-4 mb-6">
                <p className="text-sm text-error-700">
                  هل أنت متأكد من إلغاء هذا السداد؟
                </p>
              </div>

              <div className="form-group">
                <label className="input-label">سبب الإلغاء</label>
                <input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="input-field"
                  placeholder="أدخل سبب الإلغاء (اختياري)"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button
                  onClick={() => setShowCancelModal(false)}
                  className="btn btn-secondary"
                >
                  تراجع
                </button>
                <button
                  onClick={handleCancelPayment}
                  disabled={processingPayment}
                  className="btn btn-error"
                >
                  {processingPayment ? 'جاري الإلغاء...' : 'تأكيد الإلغاء'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showPolicyModal && selectedPolicy && (
        <div className="modal-overlay" onClick={() => setShowPolicyModal(false)}>
          <div
            className="modal-content max-w-2xl animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-6 border-b border-secondary-200">
              <h3 className="text-lg font-semibold text-secondary-900">
                جميع أقساط الوثيقة: {selectedPolicy.policy_number}
              </h3>
              <button
                onClick={() => setShowPolicyModal(false)}
                className="p-2 rounded-lg hover:bg-secondary-100"
              >
                <X className="w-5 h-5 text-secondary-600" />
              </button>
            </div>

            <div className="p-6">
              {loadingPolicyInstallments ? (
                <div className="flex items-center justify-center h-48">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
                </div>
              ) : policyInstallments.length === 0 ? (
                <div className="text-center py-12">
                  <p className="text-secondary-500">لا توجد أقساط لهذه الوثيقة</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-secondary-200">
                        <th className="text-right py-2 px-3">رقم القسط</th>
                        <th className="text-right py-2 px-3">القيمة</th>
                        <th className="text-right py-2 px-3">تاريخ الاستحقاق</th>
                        <th className="text-right py-2 px-3">الحالة</th>
                        <th className="text-right py-2 px-3">تاريخ السداد</th>
                        <th className="text-center py-2 px-3">إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {policyInstallments.map((installment) => (
                        <tr key={installment.id} className="border-b border-secondary-100 hover:bg-secondary-50">
                          <td className="py-3 px-3">
                            <span className="flex items-center gap-1">
                              {installment.installment_number}
                              {installment.is_first && (
                                <span className="badge badge-info text-[10px]">الأول</span>
                              )}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-semibold">{formatCurrency(installment.amount)}</td>
                          <td className="py-3 px-3">{format(new Date(installment.due_date), 'dd/MM/yyyy')}</td>
                          <td className="py-3 px-3">
                            <span
                              className={clsx(
                                'badge',
                                installment.status === 'paid' ? 'badge-success' :
                                installment.status === 'overdue' ? 'badge-error' : 'badge-warning'
                              )}
                            >
                              {INSTALLMENT_STATUS_LABELS[installment.status]}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            {installment.paid_at
                              ? format(new Date(installment.paid_at), 'dd/MM/yyyy')
                              : '-'}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {installment.status !== 'paid' && (
                              <button
                                onClick={() => {
                                  handleOpenPayment(installment);
                                  setShowPolicyModal(false);
                                }}
                                className="btn btn-primary btn-sm"
                              >
                                <CheckCircle className="w-4 h-4" />
                              </button>
                            )}
                            {installment.status === 'paid' && (
                              <button
                                onClick={() => {
                                  handleOpenCancel(installment);
                                  setShowPolicyModal(false);
                                }}
                                className="btn btn-secondary btn-sm"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="flex justify-end gap-3 p-6 border-t border-secondary-200">
              <button
                onClick={() => setShowPolicyModal(false)}
                className="btn btn-secondary"
              >
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
