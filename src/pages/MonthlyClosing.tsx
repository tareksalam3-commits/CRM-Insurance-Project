import { useState, useEffect } from 'react';
import { useAuth } from '../hooks/useAuth';
import { supabase, type MonthlyClosing as MonthlyClosingRecord } from '../lib/supabase';
import {
  Lock,
  Unlock,
  CheckCircle,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  DollarSign
} from 'lucide-react';
import clsx from 'clsx';
import { format, startOfMonth, subMonths, addMonths, isSameMonth } from 'date-fns';
import { ar } from 'date-fns/locale';

export function MonthlyClosing() {
  const { user } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(startOfMonth(new Date()));
  const [monthlyData, setMonthlyData] = useState<any>(null);
  const [closings, setClosings] = useState<MonthlyClosingRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'close' | 'open'>('close');

  const canClose = user && (user.role === 'supervisor' || user.role === 'general_supervisor' ||
    user.role === 'development_manager' || user.role === 'super_admin');

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, selectedMonth]);

  const loadData = async () => {
    setLoading(true);
    try {
      const monthStr = format(selectedMonth, 'yyyy-MM-dd');

      const { data: closingData } = await supabase
        .from('monthly_closings')
        .select('*')
        .eq('month', monthStr)
        .maybeSingle();

      const isClosed = closingData && !closingData.is_open;

      const { data: subtree } = await supabase.rpc('get_user_subtree', {
        user_id: user?.id
      });
      const userIds = subtree || [user?.id];

      const { data: payments } = await supabase
        .from('payments')
        .select('amount, installment:installment_id(is_first, policy:policy_id(owner_id))')
        .eq('payment_month', monthStr)
        .eq('is_cancelled', false);

      const filteredPayments = (payments || []).filter(
        (p: any) => userIds.includes(p.installment?.policy?.owner_id)
      );

      const production = filteredPayments
        .filter((p: any) => p.installment?.is_first)
        .reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      const productionCount = filteredPayments.filter((p: any) => p.installment?.is_first).length;

      const collection = filteredPayments
        .filter((p: any) => !p.installment?.is_first)
        .reduce((sum: number, p: any) => sum + Number(p.amount), 0);
      const collectionCount = filteredPayments.filter((p: any) => !p.installment?.is_first).length;

      setMonthlyData({
        isClosed,
        closing: closingData,
        production,
        productionCount,
        collection,
        collectionCount,
        total: production + collection,
        totalCount: productionCount + collectionCount
      });

      const { data: allClosings } = await supabase
        .from('monthly_closings')
        .select('*, closed_by:closed_by_user_id(name), opened_by:opened_by_user_id(name)')
        .order('month', { ascending: false })
        .limit(12);

      setClosings(allClosings as MonthlyClosingRecord[] || []);
    } catch (error) {
      console.error('Error loading data:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenConfirm = (action: 'close' | 'open') => {
    if (!canClose) return;
    setConfirmAction(action);
    setShowConfirmModal(true);
  };

  const handleConfirmAction = async () => {
    if (!user || !canClose) return;
    setProcessing(true);

    try {
      const monthStr = format(selectedMonth, 'yyyy-MM-dd');

      if (confirmAction === 'close') {
        const { error } = await supabase
          .from('monthly_closings')
          .insert({
            month: monthStr,
            closed_by_user_id: user.id,
            is_open: false
          });

        if (error) {
          if (error.code === '23505') {
            const { error: updateError } = await supabase
              .from('monthly_closings')
              .update({ is_open: false, opened_at: null, opened_by_user_id: null })
              .eq('month', monthStr);

            if (updateError) throw updateError;
          } else {
            throw error;
          }
        }

        await supabase.rpc('log_activity', {
          p_action: 'month_close',
          p_entity_type: 'monthly_closing'
        });
      } else {
        const { error } = await supabase
          .from('monthly_closings')
          .update({
            is_open: true,
            opened_at: new Date().toISOString(),
            opened_by_user_id: user.id
          })
          .eq('month', monthStr);

        if (error) throw error;

        await supabase.rpc('log_activity', {
          p_action: 'month_open',
          p_entity_type: 'monthly_closing'
        });
      }

      setShowConfirmModal(false);
      loadData();
    } catch (error) {
      console.error('Error processing action:', error);
      alert('حدث خطأ أثناء العملية');
    } finally {
      setProcessing(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ar-EG', {
      style: 'currency',
      currency: 'EGP',
      minimumFractionDigits: 0
    }).format(amount);
  };

  const navigateMonth = (direction: 'prev' | 'next') => {
    setSelectedMonth((prev) =>
      direction === 'prev' ? subMonths(prev, 1) : addMonths(prev, 1)
    );
  };

  const isCurrentMonth = isSameMonth(selectedMonth, new Date());

  if (!canClose) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh]">
        <Lock className="w-16 h-16 text-secondary-300 mb-4" />
        <p className="text-secondary-500">ليس لديك صلاحية للوصول لهذه الصفحة</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fadeIn">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-secondary-900">تقفيل الشهر</h2>
          <p className="text-sm text-secondary-500 mt-1">
            إغلاق وفتح الشهور المالية
          </p>
        </div>
      </div>

      <div className="card">
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => navigateMonth('prev')}
            className="btn btn-ghost"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
          <div className="text-center">
            <h3 className="text-lg font-semibold text-secondary-900">
              {format(selectedMonth, 'MMMM yyyy', { locale: ar })}
            </h3>
            {monthlyData?.isClosed && (
              <span className="badge badge-success mt-1">
                <Lock className="w-3 h-3 ml-1" />
                مغلق
              </span>
            )}
          </div>
          <button
            onClick={() => navigateMonth('next')}
            disabled={isCurrentMonth}
            className="btn btn-ghost disabled:opacity-50"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
              <div className="p-4 bg-success-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <DollarSign className="w-8 h-8 text-success-600" />
                  <div className="text-left">
                    <p className="text-sm text-secondary-600">الإنتاج الجديد</p>
                    <p className="text-xl font-bold text-success-700">
                      {formatCurrency(monthlyData?.production || 0)}
                    </p>
                    <p className="text-xs text-secondary-500 mt-1">
                      {monthlyData?.productionCount || 0} قسط
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-info-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <DollarSign className="w-8 h-8 text-info-600" />
                  <div className="text-left">
                    <p className="text-sm text-secondary-600">التحصيل الدوري</p>
                    <p className="text-xl font-bold text-info-700">
                      {formatCurrency(monthlyData?.collection || 0)}
                    </p>
                    <p className="text-xs text-secondary-500 mt-1">
                      {monthlyData?.collectionCount || 0} قسط
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 bg-primary-50 rounded-lg">
                <div className="flex items-center justify-between">
                  <DollarSign className="w-8 h-8 text-primary-600" />
                  <div className="text-left">
                    <p className="text-sm text-secondary-600">الإجمالي</p>
                    <p className="text-xl font-bold text-primary-700">
                      {formatCurrency(monthlyData?.total || 0)}
                    </p>
                    <p className="text-xs text-secondary-500 mt-1">
                      {monthlyData?.totalCount || 0} قسط
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <div className="flex justify-center gap-4">
              {monthlyData?.isClosed ? (
                <>
                  <div className="flex items-center gap-2 text-success-600 bg-success-50 px-4 py-2 rounded-lg">
                    <CheckCircle className="w-5 h-5" />
                    <span>الشهر مغلق</span>
                  </div>
                  <button
                    onClick={() => handleOpenConfirm('open')}
                    className="btn btn-warning"
                    disabled={monthlyData.closing?.closed_by_user_id !== user?.id &&
                      user?.role !== 'super_admin' && user?.role !== 'development_manager'}
                  >
                    <Unlock className="w-5 h-5" />
                    <span>فتح الشهر</span>
                  </button>
                </>
              ) : (
                <button
                  onClick={() => handleOpenConfirm('close')}
                  className="btn btn-primary"
                >
                  <Lock className="w-5 h-5" />
                  <span>تقفيل الشهر</span>
                </button>
              )}
            </div>

            {!monthlyData?.isClosed && (
              <div className="mt-4 p-4 bg-warning-50 rounded-lg flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-warning-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-warning-700">
                    تنبيه
                  </p>
                  <p className="text-sm text-warning-600 mt-1">
                    بعد تقفيل الشهر لن يتمكن أي مستخدم من إضافة أو إلغاء مدفوعات لهذا الشهر.
                    يمكنك فتح الشهر لاحقاً إذا لزم الأمر.
                  </p>
                </div>
              </div>
            )}
          </>
        )}
      </div>

      <div className="card">
        <h3 className="font-semibold text-secondary-900 mb-4">سجل التقفيل</h3>
        {closings.length === 0 ? (
          <p className="text-secondary-500 text-center py-4">لا يوجد سجل تقفيل</p>
        ) : (
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>الشهر</th>
                  <th>الحالة</th>
                  <th>أغلق بواسطة</th>
                  <th>تاريخ الإغلاق</th>
                  <th>فتح بواسطة</th>
                  <th>تاريخ الفتح</th>
                </tr>
              </thead>
              <tbody>
                {closings.map((closing) => (
                  <tr key={closing.id}>
                    <td className="font-medium">
                      {format(new Date(closing.month), 'MMMM yyyy', { locale: ar })}
                    </td>
                    <td>
                      <span className={clsx('badge', closing.is_open ? 'badge-info' : 'badge-success')}>
                        {closing.is_open ? 'مفتوح' : 'مغلق'}
                      </span>
                    </td>
                    <td>{(closing as any).closed_by?.name || '-'}</td>
                    <td>{format(new Date(closing.closed_at), 'dd/MM/yyyy HH:mm')}</td>
                    <td>{(closing as any).opened_by?.name || '-'}</td>
                    <td>
                      {closing.opened_at
                        ? format(new Date(closing.opened_at), 'dd/MM/yyyy HH:mm')
                        : '-'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showConfirmModal && (
        <div className="modal-overlay" onClick={() => setShowConfirmModal(false)}>
          <div
            className="modal-content max-w-sm animate-fadeIn"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="p-6 text-center">
              {confirmAction === 'close' ? (
                <>
                  <div className="w-12 h-12 rounded-full bg-primary-100 flex items-center justify-center mx-auto mb-4">
                    <Lock className="w-6 h-6 text-primary-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-secondary-900 mb-2">
                    تأكيد التقفيل
                  </h3>
                  <p className="text-secondary-600 mb-6">
                    هل أنت متأكد من تقفيل شهر {format(selectedMonth, 'MMMM yyyy', { locale: ar })}؟
                    <br />
                    <span className="text-warning-600 text-sm">
                      لن يتمكن أي مستخدم من إضافة أو إلغاء مدفوعات بعد التقفيل.
                    </span>
                  </p>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 rounded-full bg-warning-100 flex items-center justify-center mx-auto mb-4">
                    <Unlock className="w-6 h-6 text-warning-600" />
                  </div>
                  <h3 className="text-lg font-semibold text-secondary-900 mb-2">
                    تأكيد فتح الشهر
                  </h3>
                  <p className="text-secondary-600 mb-6">
                    هل أنت متأكد من فتح شهر {format(selectedMonth, 'MMMM yyyy', { locale: ar })}؟
                  </p>
                </>
              )}
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setShowConfirmModal(false)}
                  className="btn btn-secondary"
                >
                  إلغاء
                </button>
                <button
                  onClick={handleConfirmAction}
                  disabled={processing}
                  className={clsx('btn', confirmAction === 'close' ? 'btn-primary' : 'btn-warning')}
                >
                  {processing ? 'جاري...' : 'تأكيد'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
