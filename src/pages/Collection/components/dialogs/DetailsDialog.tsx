import { format } from 'date-fns';
import { X } from 'lucide-react';
import { POLICY_TYPE_LABELS, PAYMENT_METHOD_LABELS } from '../../../../lib/supabase';
import type { InstallmentWithRelations } from '../../types';
import { formatCurrency } from '../../utils/formatCurrency';
import { DetailRow } from '../DetailRow';

interface DetailsDialogProps {
  installment: InstallmentWithRelations;
  view: 'customer' | 'policy';
  onClose: () => void;
}

// ===== مودال بيانات العميل / الوثيقة =====
export function DetailsDialog({ installment, view, onClose }: DetailsDialogProps) {
  const policy = installment.policy;
  const customer = policy.customer;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md animate-fadeIn max-h-[92dvh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-6 border-b border-secondary-200 sticky top-0 bg-white z-10">
          <h3 className="text-lg font-semibold text-secondary-900">
            {view === 'customer' ? 'بيانات العميل' : 'بيانات الوثيقة'}
          </h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100">
            <X className="w-5 h-5 text-secondary-600" />
          </button>
        </div>
        <div className="p-6 text-sm divide-y divide-secondary-100">
          {view === 'customer' ? (
            <>
              <DetailRow label="الاسم" value={customer?.name || '-'} />
              <DetailRow label="رقم الهاتف" value={customer?.phone || '-'} dir="ltr" />
              <DetailRow label="الرقم القومي" value={customer?.national_id || '-'} dir="ltr" />
              <DetailRow label="اسم الوكيل" value={policy.owner?.name || '-'} />
            </>
          ) : (
            <>
              <DetailRow label="رقم الوثيقة" value={policy.policy_number} dir="ltr" />
              <DetailRow label="نوع الوثيقة" value={POLICY_TYPE_LABELS[policy.policy_type] || policy.policy_type} />
              <DetailRow label="تاريخ البداية" value={format(new Date(policy.start_date), 'dd/MM/yyyy')} />
              <DetailRow label="طريقة السداد" value={PAYMENT_METHOD_LABELS[policy.payment_method] || policy.payment_method} />
              <DetailRow label="قيمة القسط" value={formatCurrency(policy.premium_amount)} />
              <DetailRow label="حالة الوثيقة" value={policy.status === 'cancelled' ? 'ملغاة' : 'نشطة'} />
            </>
          )}
        </div>
        <div className="flex justify-end p-6 pt-0">
          <button onClick={onClose} className="btn btn-secondary">إغلاق</button>
        </div>
      </div>
    </div>
  );
}
