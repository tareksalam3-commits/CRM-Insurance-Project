import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
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
  X,
  FileText        // ✅ إصلاح #1: كان ناقص من الـ imports → سبب الصفحة البيضاء
} from 'lucide-react';
import clsx from 'clsx';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { ar } from 'date-fns/locale';

type TabType = 'new_production' | 'periodic' | 'overdue' | 'paid_new' | 'paid_periodic';
type InstallmentWithRelations = Installment & {
  policy: Policy & { customer: { name: string }; owner: { name: string } };
};

const VALID_TABS: TabType[] = ['new_production', 'periodic', 'overdue', 'paid_new', 'paid_periodic'];

export function Collection() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabType | null;
  const initialTab = tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : 'new_production';
  const [activeTab, setActiveTab]               = useState<TabType>(initialTab);
  const [installments, setInstallments]         = useState<InstallmentWithRelations[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [page, setPage]                         = useState(1);
  const [totalPages, setTotalPages]             = useState(1);
  const [totalCount, setTotalCount]             = useState(0);
  const [searchQuery, setSearchQuery]           = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<InstallmentWithRelations | null>(null);
  const [processingPayment, setProcessingPayment] = useState(false);
  const [showCancelModal, setShowCancelModal]   = useState(false);
  const [cancelReason, setCancelReason]         = useState('');
  const [showPolicyModal, setShowPolicyModal]   = useState(false);
  const [selectedPolicy, setSelectedPolicy]     = useState<Policy | null>(null);
  const [policyInstallments, setPolicyInstallments] = useState<InstallmentWithRelations[]>([]);
  const [loadingPolicyInstallments, setLoadingPolicyInstallments] = useState(false);
  const pageSize = 10;

  useEffect(() => {
    if (tabFromUrl && VALID_TABS.includes(tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
      setPage(1);
    }
  }, [tabFromUrl]);

  useEffect(() => {
    if (user) loadInstallments();
  }, [user, activeTab, page, searchQuery]);

  // ===================================
  // تحميل الأقساط — مُصحَّح
  // ===================================
  const loadInstallments = async () => {
    setLoading(true);
    try {
      const now        = new Date();
      const monthStart = startOfMonth(now);
      const monthEnd   = endOfMonth(now);
      const monthStartStr = format(monthStart, 'yyyy-MM-dd');
      const monthEndStr   = format(monthEnd,   'yyyy-MM-dd');

      // ✅ إصلاح #2: إضافة { count: 'exact' } لجلب العدد الكلي للـ pagination
      let query = supabase
        .from('installments')
        .select(
          `*,
           policy:policy_id(
             *,
             customer:customer_id(name),
             owner:owner_id(name)
           )`,
          { count: 'exact' }
        );

      // فلتر كل تاب
      switch (activeTab) {
        case 'new_production':
          query = query
            .eq('is_first', true)
            .eq('status', 'pending')
            .gte('due_date', monthStartStr)
            .lte('due_date', monthEndStr);
          break;
        case 'periodic':
          query = query
            .eq('is_first', false)
            .eq('status', 'pending')
            .gte('due_date', monthStartStr)
            .lte('due_date', monthEndStr);
          break;
        case 'overdue':
          query = query.eq('status', 'overdue');
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

      // ✅ إصلاح #3: البحث بـ policy_id -> policy_number بدل or على nested relation
      // Supabase لا يدعم البحث المباشر على العلاقات بـ or()
      // الحل: نجيب policy_ids المطابقة أولاً ثم نفلتر
      if (searchQuery.trim()) {
        const { data: matchedPolicies } = await supabase
          .from('policies')
          .select('id')
          .ilike('policy_number', `%${searchQuery.trim()}%`);

        const ids = (matchedPolicies || []).map((p) => p.id);
        if (ids.length === 0) {
          // لا يوجد وثائق مطابقة
          setInstallments([]);
          setTotalPages(1);
          setTotalCount(0);
          setLoading(false);
          return;
        }
        query = query.in('policy_id', ids);
      }

      const from = (page - 1) * pageSize;
      const to   = from + pageSize - 1;

      const { data, error, count } = await query
        .order('due_date', { ascending: true })
        .range(from, to);

      if (error) throw error;

      setInstallments((data as InstallmentWithRelations[]) || []);
      setTotalCount(count || 0);
      setTotalPages(Math.ceil((count || 0) / pageSize));
    } catch (error) {
      console.error('Error loading installments:', error);
    } finally {
      setLoading(false);
    }
  };

  // ===================================
  // تحميل أقساط وثيقة معينة (مودال)
  // ===================================
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
      setPolicyInstallments((data as InstallmentWithRelations[]) || []);
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

  // ===================================
  // تسجيل السداد
  // ===================================
  const handleProcessPayment = async () => {
    if (!selectedInstallment || !user) return;
    setProcessingPayment(true);
    try {
      const paymentMonth = format(startOfMonth(new Date()), 'yyyy-MM-dd');

      const { error } = await supabase
        .from('payments')
        .insert({
          installment_id:   selectedInstallment.id,
          amount:           selectedInstallment.amount,
          paid_by_user_id:  user.id,
          payment_month:    paymentMonth,
        });

      if (error) throw error;

      await supabase.rpc('log_activity', {
        p_action:      'payment_create',
        p_entity_type: 'installment',
        p_entity_id:   selectedInstallment.id,
      });

      setShowPaymentModal(false);
      setSelectedInstallment(null);
      // إعادة تحميل القائمة الرئيسية
      loadInstallments();
      // لو مودال الوثيقة مفتوح، حدّثه هو كمان
      if (showPolicyModal && selectedPolicy) {
        loadPolicyInstallments(selectedPolicy.id);
      }
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

  // ===================================
  // إلغاء السداد
  // ===================================
  const handleCancelPayment = async () => {
    if (!selectedInstallment || !user) return;
    setProcessingPayment(true);
    try {
      const paidAt     = selectedInstallment.paid_at;
      const monthStart = format(startOfMonth(new Date(paidAt || new Date())), 'yyyy-MM-dd');

      // التحقق من الشهر المقفل
      const { data: isClosed } = await supabase.rpc('is_month_closed', {
        check_month: monthStart,
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
          is_cancelled:           true,
          cancelled_at:           new Date().toISOString(),
          cancelled_by_user_id:   user.id,
          cancel_reason:          cancelReason || 'إلغاء السداد',
        })
        .eq('id', payment.id);

      if (error) throw error;

      await supabase.rpc('log_activity', {
        p_action:      'payment_cancel',
        p_entity_type: 'installment',
        p_entity_id:   selectedInstallment.id,
      });

      setShowCancelModal(false);
      setSelectedInstallment(null);
      setCancelReason('');
      loadInstallments();
      if (showPolicyModal && selectedPolicy) {
        loadPolicyInstallments(selectedPolicy.id);
      }
    } catch (error) {
      console.error('Error cancelling payment:', error);
      alert('حدث خطأ أثناء إلغاء السداد');
    } finally {
      setProcessingPayment(false);
    }
  };

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('ar-EG', {
      style:                 'currency',
      currency:              'EGP',
      minimumFractionDigits: 0,
    }).format(amount);

  const tabs = [
    { id: 'new_production', label: 'الإنتاج الجديد',    icon: DollarSign    },
    { id: 'periodic',       label: 'التحصيل الدوري',    icon: Calendar      },
    { id: 'overdue',        label: 'المتأخر',            icon: AlertTriangle },
    { id: 'paid_new',       label: 'المسدد (جديد)',      icon: CheckCircle   },
    { id: 'paid_periodic',  label: 'المسدد (تحصيل)',     icon: CheckCircle   },
  ];

  // ===================================
  // الواجهة
  // ===================================
  return (
    <div className="space-y-6 animate-fadeIn">

      {/* رأس الصفحة */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-secondary-900">التحصيل والسداد</h2>
          <p className="text-sm text-secondary-500 mt-1">
            إدارة السداد للأقساط — {format(new Date(), 'MMMM yyyy', { locale: ar })}
          </p>
        </div>
      </div>

      {/* تابات */}
      <div className="flex flex-wrap gap-2">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => { setActiveTab(tab.id as TabType); setPage(1); }}
              className={clsx('btn', activeTab === tab.id ? 'btn-primary' : 'btn-secondary')}
            >
              <Icon className="w-4 h-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* الجدول */}
      <div className="card">
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => { setSearchQuery(e.target.value); setPage(1); }}
              placeholder="بحث برقم الوثيقة..."
              className="input-field pr-10"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : installments.length === 0 ? (
          <div className="text-center py-12">
            <CreditCard className="w-16 h-16 text-secondary-300 mx-auto mb-4" />
            <p className="text-secondary-500">لا توجد أقساط</p>
          </div>
        ) : (
          <>
            {/* عدد النتائج */}
            <p className="text-xs text-secondary-400 mb-3">
              إجمالي النتائج: {totalCount}
            </p>

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
                        <span className={clsx(
                          'badge',
                          installment.status === 'paid'    ? 'badge-success' :
                          installment.status === 'overdue' ? 'badge-error'   : 'badge-warning'
                        )}>
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
                          {/* زر عرض جميع أقساط الوثيقة */}
                          <button
                            onClick={() => handleOpenPolicyDetails((installment.policy as any))}
                            className="btn btn-ghost btn-sm"
                            title="عرض جميع أقساط الوثيقة"
                          >
                            <FileText className="w-4 h-4" />
                          </button>

                          {/* زر سداد */}
                          {installment.status !== 'paid' && (
                            <button
                              onClick={() => handleOpenPayment(installment)}
                              className="btn btn-primary btn-sm"
                            >
                              <CheckCircle className="w-4 h-4" />
                              <span>سداد</span>
                            </button>
                          )}

                          {/* زر إلغاء */}
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

      {/* ===== مودال تأكيد السداد ===== */}
      {showPaymentModal && selectedInstallment && (
        <div className="modal-overlay" onClick={() => setShowPaymentModal(false)}>
          <div className="modal-content max-w-md animate-fadeIn" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-secondary-200">
              <h3 className="text-lg font-semibold text-secondary-900">تأكيد السداد</h3>
              <button onClick={() => setShowPaymentModal(false)} className="p-2 rounded-lg hover:bg-secondary-100">
                <X className="w-5 h-5 text-secondary-600" />
              </button>
            </div>
            <div className="p-6">
              <div className="bg-primary-50 rounded-lg p-4 mb-6 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-secondary-600">رقم الوثيقة</span>
                  <span className="font-semibold">{(selectedInstallment.policy as any)?.policy_number}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-secondary-600">العميل</span>
                  <span className="font-semibold">{(selectedInstallment.policy as any)?.customer?.name}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-secondary-600">رقم القسط</span>
                  <span className="font-semibold">{selectedInstallment.installment_number}</span>
                </div>
                <div className="flex items-center justify-between border-t border-primary-100 pt-2">
                  <span className="text-sm text-secondary-600">قيمة القسط</span>
                  <span className="text-xl font-bold text-primary-700">
                    {formatCurrency(selectedInstallment.amount)}
                  </span>
                </div>
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowPaymentModal(false)} className="btn btn-secondary">
                  إلغاء
                </button>
                <button onClick={handleProcessPayment} disabled={processingPayment} className="btn btn-success">
                  {processingPayment
                    ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /><span>جاري التسجيل...</span></>
                    : <><CheckCircle className="w-4 h-4" /><span>تأكيد السداد</span></>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال إلغاء السداد ===== */}
      {showCancelModal && selectedInstallment && (
        <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
          <div className="modal-content max-w-md animate-fadeIn" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-secondary-200">
              <h3 className="text-lg font-semibold text-secondary-900">إلغاء السداد</h3>
              <button onClick={() => setShowCancelModal(false)} className="p-2 rounded-lg hover:bg-secondary-100">
                <X className="w-5 h-5 text-secondary-600" />
              </button>
            </div>
            <div className="p-6">
              <div className="bg-error-50 rounded-lg p-4 mb-4 space-y-2">
                <p className="text-sm text-error-700 font-medium">هل أنت متأكد من إلغاء هذا السداد؟</p>
                <div className="flex justify-between text-sm">
                  <span className="text-secondary-600">رقم الوثيقة</span>
                  <span className="font-medium">{(selectedInstallment.policy as any)?.policy_number}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-secondary-600">القسط رقم</span>
                  <span className="font-medium">{selectedInstallment.installment_number}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-secondary-600">المبلغ</span>
                  <span className="font-medium">{formatCurrency(selectedInstallment.amount)}</span>
                </div>
              </div>
              <div className="form-group mb-4">
                <label className="input-label">سبب الإلغاء</label>
                <input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  className="input-field"
                  placeholder="أدخل سبب الإلغاء (اختياري)"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowCancelModal(false)} className="btn btn-secondary">
                  تراجع
                </button>
                <button onClick={handleCancelPayment} disabled={processingPayment} className="btn btn-error">
                  {processingPayment
                    ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /><span>جاري الإلغاء...</span></>
                    : <><XCircle className="w-4 h-4" /><span>تأكيد الإلغاء</span></>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال جميع أقساط الوثيقة ===== */}
      {showPolicyModal && selectedPolicy && (
        <div className="modal-overlay" onClick={() => setShowPolicyModal(false)}>
          <div className="modal-content max-w-2xl animate-fadeIn" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-secondary-200">
              <h3 className="text-lg font-semibold text-secondary-900">
                جميع أقساط الوثيقة: {selectedPolicy.policy_number}
              </h3>
              <button onClick={() => setShowPolicyModal(false)} className="p-2 rounded-lg hover:bg-secondary-100">
                <X className="w-5 h-5 text-secondary-600" />
              </button>
            </div>
            <div className="p-6">
              {loadingPolicyInstallments ? (
                <div className="flex items-center justify-center h-48">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                </div>
              ) : policyInstallments.length === 0 ? (
                <p className="text-center text-secondary-500 py-12">لا توجد أقساط لهذه الوثيقة</p>
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
                      {policyInstallments.map((inst) => (
                        <tr key={inst.id} className="border-b border-secondary-100 hover:bg-secondary-50">
                          <td className="py-3 px-3">
                            <span className="flex items-center gap-1">
                              {inst.installment_number}
                              {inst.is_first && (
                                <span className="badge badge-info text-[10px]">الأول</span>
                              )}
                            </span>
                          </td>
                          <td className="py-3 px-3 font-semibold">{formatCurrency(inst.amount)}</td>
                          <td className="py-3 px-3">{format(new Date(inst.due_date), 'dd/MM/yyyy')}</td>
                          <td className="py-3 px-3">
                            <span className={clsx(
                              'badge',
                              inst.status === 'paid'    ? 'badge-success' :
                              inst.status === 'overdue' ? 'badge-error'   : 'badge-warning'
                            )}>
                              {INSTALLMENT_STATUS_LABELS[inst.status]}
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            {inst.paid_at ? format(new Date(inst.paid_at), 'dd/MM/yyyy') : '-'}
                          </td>
                          <td className="py-3 px-3 text-center">
                            {inst.status !== 'paid' ? (
                              <button
                                onClick={() => { handleOpenPayment(inst); setShowPolicyModal(false); }}
                                className="btn btn-primary btn-sm"
                                title="سداد"
                              >
                                <CheckCircle className="w-4 h-4" />
                                <span>سداد</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => { handleOpenCancel(inst); setShowPolicyModal(false); }}
                                className="btn btn-secondary btn-sm"
                                title="إلغاء السداد"
                              >
                                <XCircle className="w-4 h-4" />
                                <span>إلغاء</span>
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
              <button onClick={() => setShowPolicyModal(false)} className="btn btn-secondary">
                إغلاق
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
