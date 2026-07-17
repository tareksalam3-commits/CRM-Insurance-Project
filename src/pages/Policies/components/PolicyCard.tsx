import { memo } from 'react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { User as UserIcon } from 'lucide-react';
import { POLICY_TYPE_LABELS, POLICY_STATUS_LABELS, type Policy } from '../../../lib/supabase';
import { STATUS_BADGE_CLASS, STATUS_DOT_CLASS } from '../constants';
import { formatCurrency } from '../utils/formatCurrency';
import { PolicyActions } from './PolicyActions';

interface PolicyCardProps {
  policy: Policy;
  onOpenDetails: (policy: Policy) => void;
  onOpenMoreMenu: (policy: Policy) => void;
}

function PolicyCardImpl({ policy, onOpenDetails, onOpenMoreMenu }: PolicyCardProps) {
  return (
    <div
      onClick={() => onOpenDetails(policy)}
      className="card pressable cursor-pointer hover:shadow-md hover:border-primary-200 transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-secondary-900 font-semibold truncate">
            <UserIcon className="w-4 h-4 text-secondary-400 shrink-0" />
            <span className="truncate">{(policy as any).customer?.name || '-'}</span>
          </div>
          <p className="text-xs text-secondary-500 mt-1 font-mono">#{policy.policy_number}</p>
        </div>
        <span className={clsx('badge shrink-0 gap-1.5', STATUS_BADGE_CLASS[policy.status] || 'badge-secondary')}>
          <span className={clsx('w-1.5 h-1.5 rounded-full', STATUS_DOT_CLASS[policy.status] || 'bg-secondary-400')} />
          {POLICY_STATUS_LABELS[policy.status]}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 mt-4 text-sm">
        <div>
          <p className="text-secondary-400 text-xs">نوع الوثيقة</p>
          <p className="text-secondary-800 font-medium truncate">{POLICY_TYPE_LABELS[policy.policy_type]}</p>
        </div>
        <div>
          <p className="text-secondary-400 text-xs">مبلغ التأمين</p>
          <p className="text-secondary-800 font-medium">{policy.sum_assured ? formatCurrency(policy.sum_assured) : '-'}</p>
        </div>
        <div>
          <p className="text-secondary-400 text-xs">قيمة القسط</p>
          <p className="text-secondary-800 font-medium">{formatCurrency(policy.premium_amount)}</p>
        </div>
        <div>
          <p className="text-secondary-400 text-xs">تاريخ البداية</p>
          <p className="text-secondary-800 font-medium">{format(new Date(policy.start_date), 'dd/MM/yyyy')}</p>
        </div>
        <div className="col-span-2">
          <p className="text-secondary-400 text-xs">اسم الوكيل</p>
          <p className="text-secondary-800 font-medium truncate">{(policy as any).owner?.name || '-'}</p>
        </div>
      </div>

      <PolicyActions
        policy={policy}
        onViewDetails={onOpenDetails}
        onOpenMoreMenu={onOpenMoreMenu}
      />
    </div>
  );
}

// React.memo: نفس منطق CustomerCard — تُعاد رسم البطاقة فقط عند تغيّر
// بياناتها الفعلية أو دوال الأحداث الثابتة الممرَّرة لها
export const PolicyCard = memo(PolicyCardImpl);
