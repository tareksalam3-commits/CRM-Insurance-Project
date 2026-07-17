import clsx from 'clsx';
import { format } from 'date-fns';
import { X } from 'lucide-react';
import { POLICY_TYPE_LABELS, POLICY_STATUS_LABELS, PAYMENT_METHOD_LABELS, type Installment } from '../../../../lib/supabase';
import { getPolicyStatusBadgeClass } from '../../../../features/installments/installmentHelpers';
import { InstallmentsTable } from '../../../../features/installments/InstallmentsTable';
import type { PolicyWithRelations } from '../../../PolicyDetail/types';
import type { CustomerPolicySummary } from '../../types';
import { formatCurrency } from '../../utils';

interface PolicyDetailsDialogProps {
  openPolicySummary: CustomerPolicySummary;
  policyDetail: PolicyWithRelations | null;
  policyInstallments: Installment[];
  loadingPolicyDetail: boolean;
  onClose: () => void;
  onPay: (installment: Installment) => void;
  onCancel: (installment: Installment) => void;
}

// ===== بوتوم شيت: تفاصيل الوثيقة + جدول الأقساط الموحّد (Lazy Loading) =====
export function PolicyDetailsDialog({
  openPolicySummary,
  policyDetail,
  policyInstallments,
  loadingPolicyDetail,
  onClose,
  onPay,
  onCancel,
}: PolicyDetailsDialogProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-2xl animate-fadeIn max-h-[92dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-secondary-200 sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-secondary-900 truncate font-mono" dir="ltr">
              #{openPolicySummary.policy_number}
            </h3>
            <p className="text-xs text-secondary-500 mt-0.5">تفاصيل الوثيقة</p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100 shrink-0">
            <X className="w-5 h-5 text-secondary-600" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {loadingPolicyDetail ? (
            <div className="flex items-center justify-center h-32">
              <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
            </div>
          ) : (
            <>
              {policyDetail && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm bg-secondary-50 rounded-xl p-4">
                  <div>
                    <p className="text-secondary-400 text-xs mb-1">نوع الوثيقة</p>
                    <p className="font-medium text-secondary-900">{POLICY_TYPE_LABELS[policyDetail.policy_type]}</p>
                  </div>
                  <div>
                    <p className="text-secondary-400 text-xs mb-1">الحالة</p>
                    <span className={clsx('badge', getPolicyStatusBadgeClass(policyDetail.status))}>
                      {POLICY_STATUS_LABELS[policyDetail.status]}
                    </span>
                  </div>
                  <div>
                    <p className="text-secondary-400 text-xs mb-1">مبلغ التأمين</p>
                    <p className="font-medium text-secondary-900">
                      {policyDetail.sum_assured != null ? formatCurrency(policyDetail.sum_assured) : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-secondary-400 text-xs mb-1">قيمة القسط</p>
                    <p className="font-medium text-secondary-900">{formatCurrency(policyDetail.premium_amount)}</p>
                  </div>
                  <div>
                    <p className="text-secondary-400 text-xs mb-1">تاريخ الإصدار</p>
                    <p className="font-medium text-secondary-900">
                      {format(new Date(policyDetail.start_date), 'dd/MM/yyyy')}
                    </p>
                  </div>
                  <div>
                    <p className="text-secondary-400 text-xs mb-1">طريقة السداد</p>
                    <p className="font-medium text-secondary-900">
                      {policyDetail.payment_method ? PAYMENT_METHOD_LABELS[policyDetail.payment_method] : '—'}
                    </p>
                  </div>
                </div>
              )}

              {/* ===== جدول الأقساط الموحّد — نفس المكوّن المستخدم فى صفحة التحصيل والسداد وصفحة تفاصيل الوثيقة ===== */}
              <div>
                <h4 className="text-sm font-semibold text-secondary-900 mb-3">جدول الأقساط</h4>
                <InstallmentsTable
                  installments={policyInstallments}
                  policyStatus={policyDetail?.status}
                  onPay={onPay}
                  onCancel={onCancel}
                />
              </div>
            </>
          )}
        </div>

        <div className="safe-area-bottom" />
      </div>
    </div>
  );
}
