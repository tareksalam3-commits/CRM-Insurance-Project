import { memo } from 'react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { User as UserIcon } from 'lucide-react';
import type { CustomerWithRelations } from '../types';
import { getLatestPolicy, getCustomerPolicyStatus } from '../services/customersService';
import { STATUS_BADGE_CLASS, STATUS_DOT_CLASS, STATUS_LABEL } from '../constants';
import { formatCurrency } from '../utils';
import { CustomerActions } from './CustomerActions';

interface CustomerCardProps {
  customer: CustomerWithRelations;
  onOpenDetails: (customer: CustomerWithRelations) => void;
  onOpenMoreMenu: (customer: CustomerWithRelations) => void;
}

function CustomerCardImpl({ customer, onOpenDetails, onOpenMoreMenu }: CustomerCardProps) {
  const latestPolicy = getLatestPolicy(customer);
  const statusKey = getCustomerPolicyStatus(customer);

  return (
    <div
      onClick={() => onOpenDetails(customer)}
      className="card pressable cursor-pointer hover:shadow-md hover:border-primary-200 transition-all duration-200"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-secondary-900 font-semibold truncate">
            <UserIcon className="w-4 h-4 text-secondary-400 shrink-0" />
            <span className="truncate">{customer.name}</span>
          </div>
          <p className="text-xs text-secondary-500 mt-1 font-mono" dir="ltr">
            {latestPolicy ? `#${latestPolicy.policy_number}` : 'بدون رقم وثيقة'}
          </p>
        </div>
        <span className={clsx('badge shrink-0 gap-1.5', STATUS_BADGE_CLASS[statusKey])}>
          <span className={clsx('w-1.5 h-1.5 rounded-full', STATUS_DOT_CLASS[statusKey])} />
          {STATUS_LABEL[statusKey]}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-x-3 gap-y-2.5 mt-4 text-sm">
        <div>
          <p className="text-secondary-400 text-xs">رقم الهاتف</p>
          <p className="text-secondary-800 font-medium truncate" dir="ltr">{customer.phone || '-'}</p>
        </div>
        <div>
          <p className="text-secondary-400 text-xs">اسم الوكيل</p>
          <p className="text-secondary-800 font-medium truncate">{customer.owner?.name || '-'}</p>
        </div>
        <div>
          <p className="text-secondary-400 text-xs">قيمة القسط الصافي</p>
          <p className="text-secondary-800 font-medium">
            {latestPolicy ? formatCurrency(latestPolicy.premium_amount) : '-'}
          </p>
        </div>
        <div>
          <p className="text-secondary-400 text-xs">
            {latestPolicy ? 'تاريخ بداية التأمين' : 'تاريخ تسجيل الطلب'}
          </p>
          <p className="text-secondary-800 font-medium">
            {format(new Date(latestPolicy ? latestPolicy.start_date : customer.created_at), 'dd/MM/yyyy')}
          </p>
        </div>
      </div>

      <CustomerActions
        customer={customer}
        onViewDetails={onOpenDetails}
        onOpenMoreMenu={onOpenMoreMenu}
      />
    </div>
  );
}

// React.memo: البطاقة تُعاد رسمها فقط لو تغيّر العميل نفسه أو دوال
// الأحداث الممرَّرة له (وهي ثابتة بالفعل بفضل useCallback فى الصفحة
// الأم)، بدلاً من إعادة رسم كل البطاقات فى كل مرة تتغير فيها حالة أخرى
// فى الصفحة (مثل كتابة نص فى البحث)
export const CustomerCard = memo(CustomerCardImpl);
