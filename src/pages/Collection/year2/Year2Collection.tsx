import { friendlyError } from '../../../lib/errorMessages';
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { useReconnectRefetch } from '../../../hooks/useReconnectRefetch';
import {
  Search, CheckCircle, History, Printer, Info,
} from 'lucide-react';
import { format } from 'date-fns';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Pagination } from '../../../components/ui/Pagination';

import clsx from 'clsx';
import type {
  Year2EligiblePolicy, Year2Payment, Year2ReportRow, PrintPeriodType, Year2QuickFilter, Year2PaymentFormData,
} from './types';
import { YEAR2_QUICK_FILTERS, year2PaymentSchema } from './types';
import {
  fetchYear2EligiblePolicies, fetchYear2Payments, addYear2Payment, cancelYear2Payment,
  fetchYear2Report, getPrintRange,
} from './year2CollectionService';
import { PrintYear2Report } from './PrintYear2Report';
import { printWithTitle } from '../../../lib/printWithTitle';
import { useNotify } from '../../../lib/notify';
import { AddPaymentModal } from './components/dialogs/AddPaymentModal';
import { HistoryModal } from './components/dialogs/HistoryModal';
import { CancelPaymentModal } from './components/dialogs/CancelPaymentModal';
import { PrintSetupModal } from './components/dialogs/PrintSetupModal';

interface Year2CollectionProps {
  // الفرع الحالي المختار (BranchProvider العام، مُمرَّر من صفحة التحصيل
  // الأب) — null يعني بدون فلترة إضافية (كل الفروع). لا يؤثر على أي شيء
  // غير عرض/تحصيل وثائق هذا الفرع تحديداً، وما زالت الشاشة معزولة تماماً
  // عن التارجت/المحقق/أي إحصائية أخرى بالنظام.
  branchId?: string | null;
}

export function Year2Collection({ branchId = null }: Year2CollectionProps) {
  const { user } = useAuth();
  const notify = useNotify();
  const [policies, setPolicies] = useState<Year2EligiblePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [localSearch, setLocalSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [quickFilter, setQuickFilter] = useState<Year2QuickFilter>('month');

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<Year2EligiblePolicy | null>(null);
  const [history, setHistory] = useState<Year2Payment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const {
    register: registerPayment, handleSubmit: handlePaymentSubmit, reset: resetPaymentForm,
    formState: { errors: paymentErrors },
  } = useForm<Year2PaymentFormData>({ resolver: zodResolver(year2PaymentSchema) });

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Year2Payment | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printPeriodType, setPrintPeriodType] = useState<PrintPeriodType>('month');
  const [printDateStr, setPrintDateStr] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [printRows, setPrintRows] = useState<Year2ReportRow[]>([]);
  const [printLabel, setPrintLabel] = useState('');
  const [printLoading, setPrintLoading] = useState(false);

  const loadPolicies = useCallback(async () => {
    setLoading(true);
    try {
      const { policies: results, totalCount: count, totalPages: pages } =
        await fetchYear2EligiblePolicies({ page, searchQuery, branchId, quickFilter });
      setPolicies(results);
      setTotalCount(count);
      setTotalPages(pages);
    } catch (error) {
      console.error('Error loading year2 policies:', error);
    } finally {
      setLoading(false);
    }
  }, [page, searchQuery, branchId, quickFilter]);

  useEffect(() => { loadPolicies(); }, [loadPolicies]);

  useReconnectRefetch(loadPolicies);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== searchQuery) {
        setSearchQuery(localSearch);
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch]);

  const handleQuickFilterSelect = (id: Year2QuickFilter) => {
    setQuickFilter(id);
    setPage(1);
  };

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0 }).format(value);

  const openHistory = async (policy: Year2EligiblePolicy) => {
    setSelectedPolicy(policy);
    setShowHistoryModal(true);
    setLoadingHistory(true);
    try {
      setHistory(await fetchYear2Payments(policy.id));
    } catch (error) {
      console.error(error);
      notify.error('حدث خطأ أثناء تحميل السجل');
    } finally {
      setLoadingHistory(false);
    }
  };

  const openAdd = (policy: Year2EligiblePolicy) => {
    setSelectedPolicy(policy);
    resetPaymentForm({ amount: undefined, paymentDate: format(new Date(), 'yyyy-MM-dd'), notes: '' });
    setShowAddModal(true);
  };

  const handleAddPayment = async (data: Year2PaymentFormData) => {
    if (!selectedPolicy || !user) return;
    setSaving(true);
    try {
      await addYear2Payment(selectedPolicy.id, data.amount, new Date(data.paymentDate), user.id, data.notes || '');
      setShowAddModal(false);
      loadPolicies();
      if (showHistoryModal) openHistory(selectedPolicy);
    } catch (error: any) {
      console.error(error);
      notify.error(friendlyError(error, 'حدث خطأ أثناء تسجيل التحصيل'));
    } finally {
      setSaving(false);
    }
  };

  const openCancel = (payment: Year2Payment) => {
    setSelectedPayment(payment);
    setCancelReason('');
    setShowCancelModal(true);
  };

  const handleCancelPayment = async () => {
    if (!selectedPayment || !user) return;
    setSaving(true);
    try {
      await cancelYear2Payment(selectedPayment, user.id, cancelReason);
      setShowCancelModal(false);
      loadPolicies();
      if (selectedPolicy) openHistory(selectedPolicy);
    } catch (error) {
      console.error(error);
      notify.error('حدث خطأ أثناء إلغاء التحصيل');
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePrint = async () => {
    setPrintLoading(true);
    try {
      const referenceDate = new Date(printDateStr);
      const rows = await fetchYear2Report(printPeriodType, referenceDate, branchId);
      const { label } = getPrintRange(printPeriodType, referenceDate);
      setPrintRows(rows);
      setPrintLabel(label);
      setTimeout(() => printWithTitle(`تحصيل-السنة-الثانية-${label}`), 100);
    } catch (error) {
      console.error(error);
      notify.error('حدث خطأ أثناء إعداد التقرير');
    } finally {
      setPrintLoading(false);
    }
  };

  const printTotal = printRows.reduce((sum, r) => sum + Number(r.amount), 0);

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="bg-primary-50 border border-primary-100 rounded-lg p-4 flex items-start gap-3 print:hidden">
        <Info className="w-5 h-5 text-primary-600 mt-0.5 flex-shrink-0" />
        <p className="text-sm text-primary-800">
          هذه الشاشة لمتابعة تحصيل السنة الثانية فقط — لا تدخل في التارجت أو المحقق
          أو أي إحصائية بلوحة التحكم. تظهر هنا فقط الوثائق التي أكملت سنة كاملة
          من تاريخ بدايتها.
        </p>
      </div>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden">
        <div>
          <h2 className="text-xl font-bold text-secondary-900">تحصيلات السنة الثانية</h2>
          <p className="text-sm text-secondary-500 mt-1">متابعة وتسديد تحصيلات السنة الثانية للوثائق</p>
        </div>
        <button onClick={() => setShowPrintModal(true)} className="btn btn-secondary">
          <Printer className="w-4 h-4" />
          <span>طباعة تقرير تحصيل</span>
        </button>
      </div>

      <div className="card print:hidden">
        <div className="mb-6 space-y-3">
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

          {/* شرائح سريعة: المستحق / متأخر / تم السداد — بنفس منطق فلتر
              السنة الأولى، محسوبة من آخر تحصيل فعلي لكل وثيقة */}
          <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1 -mx-1 px-1">
            {YEAR2_QUICK_FILTERS.map((f) => (
              <button
                key={f.id}
                onClick={() => handleQuickFilterSelect(f.id)}
                className={clsx(
                  'shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors',
                  quickFilter === f.id
                    ? 'bg-primary-600 border-primary-600 text-white'
                    : 'bg-white border-secondary-200 text-secondary-600 hover:border-primary-300'
                )}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
          </div>
        ) : policies.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-secondary-500">
              {searchQuery || quickFilter !== 'month'
                ? 'لا توجد وثائق مطابقة'
                : 'لا توجد وثائق دخلت السنة الثانية بعد'}
            </p>
          </div>
        ) : (
          <>
            <p className="text-xs text-secondary-400 mb-3">إجمالي النتائج: {totalCount}</p>
            <div className="table-container">
              <table>
                <thead>
                  <tr>
                    <th>رقم الوثيقة</th>
                    <th>العميل</th>
                    <th>تاريخ البداية</th>
                    <th>المسؤول</th>
                    <th>إجمالي محصل (سنة ٢)</th>
                    <th>إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {policies.map((policy) => (
                    <tr key={policy.id}>
                      <td className="font-medium">{policy.policy_number}</td>
                      <td>{policy.customer?.name || '-'}</td>
                      <td>{format(new Date(policy.start_date), 'dd/MM/yyyy')}</td>
                      <td>{policy.owner?.name || '-'}</td>
                      <td className="font-semibold">{formatCurrency(policy.year2_total_paid || 0)}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <button onClick={() => openHistory(policy)} className="btn btn-ghost btn-sm" title="سجل التحصيل">
                            <History className="w-4 h-4" />
                          </button>
                          <button onClick={() => openAdd(policy)} className="btn btn-primary btn-sm">
                            <CheckCircle className="w-4 h-4" />
                            <span>تسجيل تحصيل</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <Pagination
              page={page}
              totalPages={totalPages}
              onPageChange={setPage}
              className="mt-4 pt-4 border-t border-secondary-200"
            />
          </>
        )}
      </div>

      {/* ===== مودال تسجيل تحصيل ===== */}
      {showAddModal && selectedPolicy && (
        <AddPaymentModal
          policy={selectedPolicy}
          saving={saving}
          register={registerPayment}
          handleSubmit={handlePaymentSubmit}
          errors={paymentErrors}
          onSubmit={handleAddPayment}
          onClose={() => setShowAddModal(false)}
        />
      )}

      {/* ===== مودال سجل التحصيل ===== */}
      {showHistoryModal && selectedPolicy && (
        <HistoryModal
          policy={selectedPolicy}
          history={history}
          loadingHistory={loadingHistory}
          formatCurrency={formatCurrency}
          onCancelPayment={openCancel}
          onClose={() => setShowHistoryModal(false)}
        />
      )}

      {/* ===== مودال إلغاء تحصيل ===== */}
      {showCancelModal && selectedPayment && (
        <CancelPaymentModal
          payment={selectedPayment}
          saving={saving}
          cancelReason={cancelReason}
          setCancelReason={setCancelReason}
          formatCurrency={formatCurrency}
          onConfirm={handleCancelPayment}
          onClose={() => setShowCancelModal(false)}
        />
      )}

      {/* ===== مودال إعداد الطباعة ===== */}
      {showPrintModal && (
        <PrintSetupModal
          printPeriodType={printPeriodType}
          setPrintPeriodType={setPrintPeriodType}
          printDateStr={printDateStr}
          setPrintDateStr={setPrintDateStr}
          printLoading={printLoading}
          onGenerate={handleGeneratePrint}
          onClose={() => setShowPrintModal(false)}
        />
      )}

      <PrintYear2Report
        periodLabel={printLabel}
        rows={printRows}
        total={printTotal}
        generatedByName={user?.name || ''}
      />
    </div>
  );
}
