import clsx from 'clsx';
import { format } from 'date-fns';
import { X, Phone, User as UserIcon, FileText, ChevronDown, ShieldPlus, CreditCard, Edit2, Printer } from 'lucide-react';
import { MARITAL_STATUS_LABELS, PAYMENT_METHOD_LABELS, POLICY_STATUS_LABELS, POLICY_TYPE_LABELS } from '../../../../lib/supabase';
import type { PolicyInstallmentSummary } from '../../../../features/installments/installmentsService';
import type { CustomerPolicySummary, CustomerWithRelations } from '../../types';
import { STATUS_BADGE_CLASS, STATUS_DOT_CLASS } from '../../constants';
import { formatCurrency, sortPoliciesByStartDate } from '../../utils';

interface CustomerDetailsDialogProps {
  customer: CustomerWithRelations;
  showExtraInfo: boolean;
  onToggleExtraInfo: () => void;
  policySummaries: Record<string, PolicyInstallmentSummary>;
  onClose: () => void;
  onEdit: (customer: CustomerWithRelations) => void;
  onPrint: (customer: CustomerWithRelations) => void;
  onIssueNewPolicy: (customer: CustomerWithRelations) => void;
  onOpenPolicyDetails: (policy: CustomerPolicySummary) => void;
}

export function CustomerDetailsDialog({
  customer,
  showExtraInfo,
  onToggleExtraInfo,
  policySummaries,
  onClose,
  onEdit,
  onPrint,
  onIssueNewPolicy,
  onOpenPolicyDetails,
}: CustomerDetailsDialogProps) {
  const sortedPolicies = sortPoliciesByStartDate(customer.policies || []);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-lg animate-fadeIn max-h-[92dvh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b border-secondary-200 sticky top-0 bg-white z-10">
          <div className="min-w-0">
            <h3 className="text-lg font-semibold text-secondary-900 truncate">{customer.name}</h3>
            <p className="text-xs text-secondary-500 mt-0.5">تفاصيل العميل</p>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-secondary-100 shrink-0"
          >
            <X className="w-5 h-5 text-secondary-600" />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* ===== البيانات الأساسية فقط: رقم الهاتف، الوكيل المسؤول، عدد الوثائق ===== */}
          <div className="grid grid-cols-3 gap-3 text-sm">
            <div className="bg-secondary-50 rounded-xl p-3">
              <p className="text-secondary-400 text-xs mb-1 flex items-center gap-1">
                <Phone className="w-3 h-3" /> رقم الهاتف
              </p>
              <p className="text-secondary-800 font-medium truncate" dir="ltr">{customer.phone || '-'}</p>
            </div>
            <div className="bg-secondary-50 rounded-xl p-3">
              <p className="text-secondary-400 text-xs mb-1 flex items-center gap-1">
                <UserIcon className="w-3 h-3" /> الوكيل المسؤول
              </p>
              <p className="text-secondary-800 font-medium truncate">{customer.owner?.name || '-'}</p>
            </div>
            <div className="bg-secondary-50 rounded-xl p-3">
              <p className="text-secondary-400 text-xs mb-1 flex items-center gap-1">
                <FileText className="w-3 h-3" /> عدد الوثائق
              </p>
              <p className="text-secondary-800 font-medium">{sortedPolicies.length}</p>
            </div>
          </div>

          {/* ===== بيانات إضافية (اختيارية) — نفس البيانات محفوظة وقابلة للتعديل، فقط غير معروضة افتراضياً ===== */}
          <div>
            <button
              onClick={onToggleExtraInfo}
              className="flex items-center gap-1.5 text-xs font-medium text-secondary-500 hover:text-secondary-700"
            >
              <ChevronDown className={clsx('w-3.5 h-3.5 transition-transform', showExtraInfo && 'rotate-180')} />
              <span>{showExtraInfo ? 'إخفاء البيانات الإضافية' : 'عرض بيانات إضافية'}</span>
            </button>

            {showExtraInfo && (
              <div className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm mt-3 animate-fadeIn">
                <div>
                  <p className="text-secondary-400 text-xs mb-1">الرقم القومي</p>
                  <p className="text-secondary-800 font-medium" dir="ltr">{customer.national_id || '-'}</p>
                </div>
                <div>
                  <p className="text-secondary-400 text-xs mb-1">العنوان</p>
                  <p className="text-secondary-800 font-medium">{customer.address || '-'}</p>
                </div>
                <div>
                  <p className="text-secondary-400 text-xs mb-1">تاريخ الميلاد</p>
                  <p className="text-secondary-800 font-medium">
                    {customer.birth_date ? format(new Date(customer.birth_date), 'dd/MM/yyyy') : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-secondary-400 text-xs mb-1">المهنة</p>
                  <p className="text-secondary-800 font-medium">{customer.occupation || '-'}</p>
                </div>
                <div>
                  <p className="text-secondary-400 text-xs mb-1">الحالة الاجتماعية</p>
                  <p className="text-secondary-800 font-medium">
                    {customer.marital_status ? MARITAL_STATUS_LABELS[customer.marital_status] : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-secondary-400 text-xs mb-1">مبلغ التأمين (طلب التأمين)</p>
                  <p className="text-secondary-800 font-medium">
                    {customer.insurance_amount != null ? formatCurrency(customer.insurance_amount) : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-secondary-400 text-xs mb-1">طريقة السداد (طلب التأمين)</p>
                  <p className="text-secondary-800 font-medium">
                    {customer.payment_method ? PAYMENT_METHOD_LABELS[customer.payment_method] : '-'}
                  </p>
                </div>
                <div>
                  <p className="text-secondary-400 text-xs mb-1">العربون</p>
                  <p className="text-secondary-800 font-medium">
                    {customer.deposit_amount != null ? formatCurrency(customer.deposit_amount) : '-'}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* ===== الوثائق: بطاقة مستقلة لكل وثيقة ===== */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-secondary-900">
                الوثائق ({sortedPolicies.length})
              </h4>
              <button
                onClick={() => onIssueNewPolicy(customer)}
                className="btn btn-outline btn-sm"
              >
                <ShieldPlus className="w-3.5 h-3.5" />
                <span>إصدار وثيقة جديدة</span>
              </button>
            </div>

            {sortedPolicies.length === 0 ? (
              <p className="text-sm text-secondary-400 text-center py-6 bg-secondary-50 rounded-lg">
                لا توجد وثائق لهذا العميل بعد
              </p>
            ) : (
              <div className="space-y-3">
                {sortedPolicies.map((policy) => {
                  const summary = policySummaries[policy.id];
                  return (
                    <div key={policy.id} className="rounded-xl border border-secondary-200 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-secondary-900 font-mono" dir="ltr">
                            #{policy.policy_number}
                          </p>
                          <p className="text-xs text-secondary-500 mt-0.5">
                            {POLICY_TYPE_LABELS[policy.policy_type]}
                          </p>
                        </div>
                        <span className={clsx('badge shrink-0 gap-1.5', STATUS_BADGE_CLASS[policy.status])}>
                          <span className={clsx('w-1.5 h-1.5 rounded-full', STATUS_DOT_CLASS[policy.status])} />
                          {POLICY_STATUS_LABELS[policy.status]}
                        </span>
                      </div>

                      <div className="grid grid-cols-3 gap-2 mt-3 text-xs">
                        <div>
                          <p className="text-secondary-400 mb-0.5">مبلغ التأمين</p>
                          <p className="font-medium text-secondary-800">
                            {policy.sum_assured != null ? formatCurrency(policy.sum_assured) : '—'}
                          </p>
                        </div>
                        <div>
                          <p className="text-secondary-400 mb-0.5">قيمة القسط الصافي</p>
                          <p className="font-medium text-secondary-800">{formatCurrency(policy.premium_amount)}</p>
                        </div>
                        <div>
                          <p className="text-secondary-400 mb-0.5">تاريخ الإصدار</p>
                          <p className="font-medium text-secondary-800">
                            {format(new Date(policy.start_date), 'dd/MM/yyyy')}
                          </p>
                        </div>
                      </div>

                      {summary && (
                        <div className="flex items-center gap-2 mt-3 text-xs">
                          <span className="badge badge-success">مسدد {summary.paid}</span>
                          <span className="badge badge-secondary">مستحق {summary.pending}</span>
                          <span className="badge badge-error">متأخر {summary.overdue}</span>
                        </div>
                      )}

                      <button
                        onClick={() => onOpenPolicyDetails(policy)}
                        className="btn btn-secondary btn-sm w-full mt-3"
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>عرض التفاصيل</span>
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex gap-3 pt-2 border-t border-secondary-200">
            <button
              onClick={() => onEdit(customer)}
              className="btn btn-secondary flex-1"
            >
              <Edit2 className="w-4 h-4" />
              <span>تعديل البيانات</span>
            </button>
            <button
              onClick={() => onPrint(customer)}
              className="btn btn-secondary flex-1"
            >
              <Printer className="w-4 h-4" />
              <span>طباعة</span>
            </button>
          </div>
        </div>

        <div className="safe-area-bottom" />
      </div>
    </div>
  );
}
