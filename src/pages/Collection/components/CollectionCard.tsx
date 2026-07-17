import { memo } from 'react';
import { format } from 'date-fns';
import clsx from 'clsx';
import { User, Hash } from 'lucide-react';
import type { InstallmentWithRelations } from '../types';
import { formatCurrency } from '../utils/formatCurrency';
import { getInstallmentDisplayInfo } from '../utils/installmentDisplay';
import { CollectionActions } from './CollectionActions';

interface CollectionCardProps {
  installment: InstallmentWithRelations;
  onPay: (installment: InstallmentWithRelations) => void;
  onCancel: (installment: InstallmentWithRelations) => void;
  onMore: (installment: InstallmentWithRelations) => void;
}

function CollectionCardImpl({ installment, onPay, onCancel, onMore }: CollectionCardProps) {
  const { dueDate, isPaid, isOverdue, dayLabel, badgeClass, statusLabel } = getInstallmentDisplayInfo(installment);

  return (
    <div className="card">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-secondary-900 font-semibold truncate">
            <User className="w-4 h-4 text-secondary-400 shrink-0" />
            <span className="truncate">{installment.policy.customer?.name || '-'}</span>
          </div>
          <p className="text-xs text-secondary-500 mt-1 flex items-center gap-1 font-mono" dir="ltr">
            <Hash className="w-3 h-3 shrink-0" />
            <span>{installment.policy.policy_number}</span>
            {installment.is_first && (
              <span className="badge badge-info text-[10px]" dir="rtl">الأول</span>
            )}
          </p>
        </div>
        <span className={clsx('badge shrink-0', badgeClass)}>{statusLabel}</span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 mt-4 text-sm">
        <div>
          <p className="text-secondary-400 text-xs">اسم الوكيل</p>
          <p className="text-secondary-800 font-medium truncate">{installment.policy.owner?.name || '-'}</p>
        </div>
        <div>
          <p className="text-secondary-400 text-xs">قيمة القسط</p>
          <p className="text-secondary-800 font-semibold">{formatCurrency(installment.amount)}</p>
        </div>
        <div>
          <p className="text-secondary-400 text-xs">تاريخ الاستحقاق</p>
          <p className="text-secondary-800 font-medium">{format(dueDate, 'dd/MM/yyyy')}</p>
        </div>
        <div>
          <p className="text-secondary-400 text-xs">{isPaid ? 'تاريخ السداد' : 'الأيام'}</p>
          <p className={clsx('font-medium', isOverdue ? 'text-error-600' : 'text-secondary-800')}>
            {isPaid
              ? (installment.paid_at ? format(new Date(installment.paid_at), 'dd/MM/yyyy') : '-')
              : dayLabel}
          </p>
        </div>
      </div>

      <CollectionActions installment={installment} isPaid={isPaid} onPay={onPay} onCancel={onCancel} onMore={onMore} />
    </div>
  );
}

// React.memo: يمنع إعادة رسم كل بطاقات الأقساط عند إعادة رسم الصفحة لأسباب
// لا علاقة لها بالبطاقة نفسها
export const CollectionCard = memo(CollectionCardImpl);
