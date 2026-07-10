import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { type Policy, INSTALLMENT_STATUS_LABELS } from '../../lib/supabase';
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
  FileText,
  Layers,
} from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';

import { VALID_TABS, type TabType, type InstallmentWithRelations } from './types';
import {
  fetchInstallments, fetchPolicyInstallments, processPayment, cancelPayment,
  cancelSeverelyOverduePolicies,
} from './services/collectionService';
import { Year2Collection } from './year2/Year2Collection';

// نوع السنة المطلوب عرضها: لازم المستخدم يختار قبل ما يشوف أي بيانات.
// السنة الأولى = النظام الحالي بالكامل (تارجت/محقق..إلخ) بدون أي تغيير.
// السنة الثانية = شاشة منفصلة تماماً لمتابعة التحصيل فقط.
type YearMode = 'year1' | 'year2';

export function Collection() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const tabFromUrl = searchParams.get('tab') as TabType | null;
  const initialTab = tabFromUrl && VALID_TABS.includes(tabFromUrl) ? tabFromUrl : 'new_production';
  const [yearMode, setYearMode] = useState<YearMode | null>(tabFromUrl ? 'year1' : null);
  const [activeTab, setActiveTab]               = useState<TabType>(initialTab);
  const [installments, setInstallments]         = useState<InstallmentWithRelations[]>([]);
  const [loading, setLoading]                   = useState(true);
  const [page, setPage]                         = useState(1);
  const [totalPages, setTotalPages]             = useState(1);
  const [totalCount, setTotalCount]             = useState(0);
  const [searchQuery, setSearchQuery]           = useState('');
  const [localSearch, setLocalSearch]           = useState('');
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [selectedInstallment, setSelectedInstallment] = useState<InstallmentWithRelations | null>(null);
  const [paymentDateStr, setPaymentDateStr] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [processingPayment, setProcessingPayment] = useState(false);
  const [showCancelModal, setShowCancelModal]   = useState(false);
  const [cancelReason, setCancelReason]         = useState('');
  const [showPolicyModal, setShowPolicyModal]   = useState(false);
  const [selectedPolicy, setSelectedPolicy]     = useState<Policy | null>(null);
  const [policyInstallments, setPolicyInstallments] = useState<InstallmentWithRelations[]>([]);
  const [loadingPolicyInstallments, setLoadingPolicyInstallments] = useState(false);

  useEffect(() => {
    if (tabFromUrl && VALID_TABS.includes(tabFromUrl) && tabFromUrl !== activeTab) {
      setActiveTab(tabFromUrl);
      setPage(1);
    }
  }, [tabFromUrl]);

  useEffect(() => {
    if (user && yearMode === 'year1') loadInstallments();
  }, [user, yearMode, activeTab, page, searchQuery]);

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

  const loadInstallments = async () => {
    setLoading(true);
    try {
      // فحص وإلغاء أي وثيقة فاتها 3 شهور أو أكثر على قسط غير مسدد — قبل عرض
      // تبويب "المتأخر"، عشان الوثائق دي تختفي منه أول ما توصل للحد ده.
      // بيتنفذ هنا (عند فتح الصفحة) بدل جدولة دورية غير متاحة حالياً.
      try {
        await cancelSeverelyOverduePolicies();
      } catch (err) {
        // فشل هذا الفحص لا يجب أن يمنع عرض بيانات التحصيل نفسها
        console.error('Error cancelling severely overdue policies:', err);
      }

      const { installments: results, totalCount: count, totalPages: pages } =
        await fetchInstallments({ activeTab, page, searchQuery });

      setInstallments(results);
      setTotalCount(count);
      setTotalPages(pages);
    } catch (error) {
      console.error('Error loading installments:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadPolicyInstallments = async (policyId: string) => {
    setLoadingPolicyInstallments(true);
    try {
      setPolicyInstallments(await fetchPolicyInstallments(policyId));
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
    setPaymentDateStr(format(new Date(), 'yyyy-MM-dd'));
    setShowPaymentModal(true);
  };

  // ===================================
  // تسجيل السداد
  // ===================================
  const handleProcessPayment = async () => {
    if (!selectedInstallment || !user) return;
    setProcessingPayment(true);
    try {
      await processPayment(selectedInstallment, user.id, new Date(paymentDateStr));

      setShowPaymentModal(false);
      setSelectedInstallment(null);
      // إعادة تحميل القائمة الرئيسية
      loadInstallments();
      // لو مودال الوثيقة مفتوح، حدّثه هو كمان
      if (showPolicyModal && selectedPolicy) {
        loadPolicyInstallments(selectedPolicy.id);
      }
    } catch (error: any) {
      console.error('Error processing payment:', error);
      alert(error?.message || 'حدث خطأ أثناء تسجيل السداد');
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
      const { error } = await cancelPayment(selectedInstallment, user.id, cancelReason);

      if (error) {
        alert(error);
        return;
      }

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
  // شاشة اختيار السنة — تظهر أول ما تُفتح الصفحة، ولا يُعرض أي بيانات
  // (لا سنة أولى ولا سنة ثانية) قبل ما المستخدم يختار
  // ===================================
  if (yearMode === null) {
    return (
      <div className="space-y-6 animate-fadeIn">
        <div>
          <h2 className="text-xl font-bold text-secondary-900">التحصيل والسداد</h2>
          <p className="text-sm text-secondary-500 mt-1">اختر نوع التحصيل الذي تريد متابعته</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
          <button
            onClick={() => setYearMode('year1')}
            className="card text-right hover:border-primary-400 hover:shadow-md transition-all p-6"
          >
            <DollarSign className="w-8 h-8 text-primary-600 mb-3" />
            <h3 className="text-lg font-bold text-secondary-900 mb-1">تحصيلات السنة الأولى</h3>
            <p className="text-sm text-secondary-500">
              الإنتاج الجديد، التحصيل الدوري، المتأخر، والمسدد — وتدخل ضمن التارجت والمحقق
            </p>
          </button>
          <button
            onClick={() => setYearMode('year2')}
            className="card text-right hover:border-primary-400 hover:shadow-md transition-all p-6"
          >
            <Layers className="w-8 h-8 text-primary-600 mb-3" />
            <h3 className="text-lg font-bold text-secondary-900 mb-1">تحصيلات السنة الثانية</h3>
            <p className="text-sm text-secondary-500">
              متابعة وتسديد فقط للوثائق التي دخلت سنتها الثانية — لا تدخل في أي إحصائية
            </p>
          </button>
        </div>
      </div>
    );
  }

  if (yearMode === 'year2') {
    return (
      <div className="space-y-6 animate-fadeIn">
        <button onClick={() => setYearMode(null)} className="btn btn-ghost print:hidden">
          <Layers className="w-4 h-4" />
          <span>تغيير نوع التحصيل</span>
        </button>
        <Year2Collection />
      </div>
    );
  }

  // ===================================
  // الواجهة — تحصيلات السنة الأولى (النظام الحالي بدون أي تغيير)
  // ===================================
  return (
    <div className="space-y-6 animate-fadeIn">

      {/* رأس الصفحة */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <button onClick={() => setYearMode(null)} className="btn btn-ghost btn-sm mb-2">
            <Layers className="w-4 h-4" />
            <span>تغيير نوع التحصيل</span>
          </button>
          <h2 className="text-xl font-bold text-secondary-900">التحصيل والسداد — السنة الأولى</h2>
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
              value={localSearch}
              onChange={(e) => setLocalSearch(e.target.value)}
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

              {/* تاريخ السداد الفعلي — يحدد شهر التارجت اللي هيتحسب عليه */}
              <div className="form-group mb-4">
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
                  {format(new Date(paymentDateStr), 'MMMM yyyy', { locale: ar })}
                </p>
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
