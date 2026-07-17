import { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import {
  Search, X, CheckCircle, XCircle,
  History, Printer, Info,
} from 'lucide-react';
import { format } from 'date-fns';
import { Pagination } from '../../../components/ui/Pagination';

import type { Year2EligiblePolicy, Year2Payment, Year2ReportRow, PrintPeriodType } from './types';
import {
  fetchYear2EligiblePolicies, fetchYear2Payments, addYear2Payment, cancelYear2Payment,
  fetchYear2Report, getPrintRange,
} from './year2CollectionService';
import { PrintYear2Report } from './PrintYear2Report';

export function Year2Collection() {
  const { user } = useAuth();
  const [policies, setPolicies] = useState<Year2EligiblePolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [localSearch, setLocalSearch] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [selectedPolicy, setSelectedPolicy] = useState<Year2EligiblePolicy | null>(null);
  const [history, setHistory] = useState<Year2Payment[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  const [showAddModal, setShowAddModal] = useState(false);
  const [amount, setAmount] = useState('');
  const [paymentDateStr, setPaymentDateStr] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<Year2Payment | null>(null);
  const [cancelReason, setCancelReason] = useState('');

  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printPeriodType, setPrintPeriodType] = useState<PrintPeriodType>('month');
  const [printDateStr, setPrintDateStr] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [printRows, setPrintRows] = useState<Year2ReportRow[]>([]);
  const [printLabel, setPrintLabel] = useState('');
  const [printLoading, setPrintLoading] = useState(false);

  useEffect(() => { loadPolicies(); }, [page, searchQuery]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localSearch !== searchQuery) {
        setSearchQuery(localSearch);
        setPage(1);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [localSearch]);

  const loadPolicies = async () => {
    setLoading(true);
    try {
      const { policies: results, totalCount: count, totalPages: pages } =
        await fetchYear2EligiblePolicies({ page, searchQuery });
      setPolicies(results);
      setTotalCount(count);
      setTotalPages(pages);
    } catch (error) {
      console.error('Error loading year2 policies:', error);
    } finally {
      setLoading(false);
    }
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
      alert('حدث خطأ أثناء تحميل السجل');
    } finally {
      setLoadingHistory(false);
    }
  };

  const openAdd = (policy: Year2EligiblePolicy) => {
    setSelectedPolicy(policy);
    setAmount('');
    setNotes('');
    setPaymentDateStr(format(new Date(), 'yyyy-MM-dd'));
    setShowAddModal(true);
  };

  const handleAddPayment = async () => {
    if (!selectedPolicy || !user) return;
    const numericAmount = Number(amount);
    if (!numericAmount || numericAmount <= 0) {
      alert('برجاء إدخال مبلغ صحيح');
      return;
    }
    setSaving(true);
    try {
      await addYear2Payment(selectedPolicy.id, numericAmount, new Date(paymentDateStr), user.id, notes);
      setShowAddModal(false);
      loadPolicies();
      if (showHistoryModal) openHistory(selectedPolicy);
    } catch (error: any) {
      console.error(error);
      alert(error?.message || 'حدث خطأ أثناء تسجيل التحصيل');
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
      alert('حدث خطأ أثناء إلغاء التحصيل');
    } finally {
      setSaving(false);
    }
  };

  const handleGeneratePrint = async () => {
    setPrintLoading(true);
    try {
      const referenceDate = new Date(printDateStr);
      const rows = await fetchYear2Report(printPeriodType, referenceDate);
      const { label } = getPrintRange(printPeriodType, referenceDate);
      setPrintRows(rows);
      setPrintLabel(label);
      setTimeout(() => window.print(), 100);
    } catch (error) {
      console.error(error);
      alert('حدث خطأ أثناء إعداد التقرير');
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
        ) : policies.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-secondary-500">لا توجد وثائق دخلت السنة الثانية بعد</p>
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
        <div className="modal-overlay" onClick={() => setShowAddModal(false)}>
          <div className="modal-content max-w-md animate-fadeIn" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-secondary-200">
              <h3 className="text-lg font-semibold text-secondary-900">تسجيل تحصيل سنة ثانية</h3>
              <button onClick={() => setShowAddModal(false)} className="p-2 rounded-lg hover:bg-secondary-100">
                <X className="w-5 h-5 text-secondary-600" />
              </button>
            </div>
            <div className="p-6">
              <div className="bg-primary-50 rounded-lg p-4 mb-6 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-secondary-600">رقم الوثيقة</span>
                  <span className="font-semibold">{selectedPolicy.policy_number}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-secondary-600">العميل</span>
                  <span className="font-semibold">{selectedPolicy.customer?.name}</span>
                </div>
              </div>

              <div className="form-group mb-4">
                <label className="input-label">المبلغ المحصل</label>
                <input
                  type="number"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="input-field"
                  placeholder="0"
                  min="0"
                />
              </div>

              <div className="form-group mb-4">
                <label className="input-label">تاريخ التحصيل</label>
                <input
                  type="date"
                  value={paymentDateStr}
                  max={format(new Date(), 'yyyy-MM-dd')}
                  onChange={(e) => setPaymentDateStr(e.target.value)}
                  className="input-field"
                />
              </div>

              <div className="form-group mb-4">
                <label className="input-label">ملاحظات (اختياري)</label>
                <input
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="input-field"
                  placeholder="ملاحظات"
                />
              </div>

              <div className="flex justify-end gap-3">
                <button onClick={() => setShowAddModal(false)} className="btn btn-secondary">إلغاء</button>
                <button onClick={handleAddPayment} disabled={saving} className="btn btn-success">
                  {saving
                    ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /><span>جاري التسجيل...</span></>
                    : <><CheckCircle className="w-4 h-4" /><span>تأكيد التحصيل</span></>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال سجل التحصيل ===== */}
      {showHistoryModal && selectedPolicy && (
        <div className="modal-overlay" onClick={() => setShowHistoryModal(false)}>
          <div className="modal-content max-w-2xl animate-fadeIn" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-secondary-200">
              <h3 className="text-lg font-semibold text-secondary-900">
                سجل تحصيل السنة الثانية: {selectedPolicy.policy_number}
              </h3>
              <button onClick={() => setShowHistoryModal(false)} className="p-2 rounded-lg hover:bg-secondary-100">
                <X className="w-5 h-5 text-secondary-600" />
              </button>
            </div>
            <div className="p-6">
              {loadingHistory ? (
                <div className="flex items-center justify-center h-48">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600" />
                </div>
              ) : history.length === 0 ? (
                <p className="text-center text-secondary-500 py-12">لا توجد تحصيلات مسجلة بعد</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-secondary-200">
                        <th className="text-right py-2 px-3">تاريخ التحصيل</th>
                        <th className="text-right py-2 px-3">المبلغ</th>
                        <th className="text-right py-2 px-3">بواسطة</th>
                        <th className="text-right py-2 px-3">الحالة</th>
                        <th className="text-center py-2 px-3">إجراء</th>
                      </tr>
                    </thead>
                    <tbody>
                      {history.map((h) => (
                        <tr key={h.id} className="border-b border-secondary-100 hover:bg-secondary-50">
                          <td className="py-3 px-3">{format(new Date(h.payment_date), 'dd/MM/yyyy')}</td>
                          <td className="py-3 px-3 font-semibold">{formatCurrency(h.amount)}</td>
                          <td className="py-3 px-3">{h.paid_by?.name || '-'}</td>
                          <td className="py-3 px-3">
                            <span className={`badge ${h.is_cancelled ? 'badge-error' : 'badge-success'}`}>
                              {h.is_cancelled ? 'ملغى' : 'مسدد'}
                            </span>
                          </td>
                          <td className="py-3 px-3 text-center">
                            {!h.is_cancelled && (
                              <button onClick={() => openCancel(h)} className="btn btn-secondary btn-sm" title="إلغاء">
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
              <button onClick={() => setShowHistoryModal(false)} className="btn btn-secondary">إغلاق</button>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال إلغاء تحصيل ===== */}
      {showCancelModal && selectedPayment && (
        <div className="modal-overlay" onClick={() => setShowCancelModal(false)}>
          <div className="modal-content max-w-md animate-fadeIn" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-secondary-200">
              <h3 className="text-lg font-semibold text-secondary-900">إلغاء التحصيل</h3>
              <button onClick={() => setShowCancelModal(false)} className="p-2 rounded-lg hover:bg-secondary-100">
                <X className="w-5 h-5 text-secondary-600" />
              </button>
            </div>
            <div className="p-6">
              <div className="bg-error-50 rounded-lg p-4 mb-4 space-y-2">
                <p className="text-sm text-error-700 font-medium">هل أنت متأكد من إلغاء هذا التحصيل؟</p>
                <div className="flex justify-between text-sm">
                  <span className="text-secondary-600">المبلغ</span>
                  <span className="font-medium">{formatCurrency(selectedPayment.amount)}</span>
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
                <button onClick={() => setShowCancelModal(false)} className="btn btn-secondary">تراجع</button>
                <button onClick={handleCancelPayment} disabled={saving} className="btn btn-error">
                  {saving
                    ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /><span>جاري الإلغاء...</span></>
                    : <><XCircle className="w-4 h-4" /><span>تأكيد الإلغاء</span></>}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ===== مودال إعداد الطباعة ===== */}
      {showPrintModal && (
        <div className="modal-overlay print:hidden" onClick={() => setShowPrintModal(false)}>
          <div className="modal-content max-w-md animate-fadeIn" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between p-6 border-b border-secondary-200">
              <h3 className="text-lg font-semibold text-secondary-900">طباعة تقرير تحصيل السنة الثانية</h3>
              <button onClick={() => setShowPrintModal(false)} className="p-2 rounded-lg hover:bg-secondary-100">
                <X className="w-5 h-5 text-secondary-600" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <div className="form-group">
                <label className="input-label">نوع الفترة</label>
                <select
                  value={printPeriodType}
                  onChange={(e) => setPrintPeriodType(e.target.value as PrintPeriodType)}
                  className="input-field"
                >
                  <option value="month">شهر</option>
                  <option value="quarter">ربع سنة</option>
                  <option value="year">سنة</option>
                </select>
              </div>
              <div className="form-group">
                <label className="input-label">تاريخ داخل الفترة المطلوبة</label>
                <input
                  type="date"
                  value={printDateStr}
                  onChange={(e) => setPrintDateStr(e.target.value)}
                  className="input-field"
                />
              </div>
              <div className="flex justify-end gap-3">
                <button onClick={() => setShowPrintModal(false)} className="btn btn-secondary">إلغاء</button>
                <button onClick={handleGeneratePrint} disabled={printLoading} className="btn btn-primary">
                  {printLoading
                    ? <><div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" /><span>جاري الإعداد...</span></>
                    : <><Printer className="w-4 h-4" /><span>طباعة</span></>}
                </button>
              </div>
            </div>
          </div>
        </div>
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
