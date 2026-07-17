import { X, Mail, Phone, Wallet, UserCog, Calendar, Clock } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { ROLE_LABELS, type User } from '../../../lib/supabase';
import { getRoleBadgeClass } from '../business/roleHierarchy';
import { UserAvatar } from './UserAvatar';

interface UserDetailsModalProps {
  user: User;
  onClose: () => void;
}

function DetailRow({
  icon: Icon,
  label,
  value,
  dir,
}: {
  icon: any;
  label: string;
  value: string;
  dir?: 'ltr' | 'rtl';
}) {
  return (
    <div className="flex items-center gap-3 py-3 border-b border-secondary-100 last:border-b-0">
      <div className="w-9 h-9 rounded-lg bg-secondary-50 flex items-center justify-center shrink-0">
        <Icon className="w-4 h-4 text-secondary-500" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-secondary-400">{label}</p>
        <p dir={dir} className="text-sm font-medium text-secondary-900 truncate">{value}</p>
      </div>
    </div>
  );
}

export function UserDetailsModal({ user: u, onClose }: UserDetailsModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content max-w-md animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-secondary-200">
          <h3 className="text-lg font-semibold text-secondary-900">تفاصيل المستخدم</h3>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-secondary-100">
            <X className="w-5 h-5 text-secondary-600" />
          </button>
        </div>

        {/* Profile summary */}
        <div className="flex flex-col items-center text-center px-6 pt-6 pb-2">
          <UserAvatar user={u} size="lg" />
          <h4 className="mt-3 text-lg font-bold text-secondary-900">{u.name}</h4>
          <div className="flex items-center gap-2 mt-2">
            <span className={clsx('badge border', getRoleBadgeClass(u.role))}>
              {ROLE_LABELS[u.role]}
            </span>
            <span className={clsx('badge', u.is_active ? 'badge-success' : 'badge-error')}>
              {u.is_active ? 'نشط' : 'غير نشط'}
            </span>
          </div>
        </div>

        {/* Details */}
        <div className="px-6 pb-6 pt-2">
          <DetailRow icon={Mail} label="البريد الإلكتروني" value={u.email} dir="ltr" />
          <DetailRow icon={Phone} label="رقم الهاتف" value={u.phone || '—'} dir="ltr" />
          <DetailRow
            icon={UserCog}
            label="المدير المباشر"
            value={(u as any).manager?.name || 'بدون مدير'}
          />
          <DetailRow
            icon={Wallet}
            label="التارجت الشهري"
            value={
              u.target > 0
                ? new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP', minimumFractionDigits: 0 }).format(u.target)
                : 'غير محدد'
            }
          />
          <DetailRow
            icon={Clock}
            label="آخر تسجيل دخول"
            value={u.last_login ? format(new Date(u.last_login), 'dd/MM/yyyy HH:mm') : 'لم يسجل الدخول بعد'}
          />
          <DetailRow
            icon={Calendar}
            label="تاريخ الإنشاء"
            value={format(new Date(u.created_at), 'dd/MM/yyyy')}
          />
        </div>

        <div className="px-6 pb-6">
          <button onClick={onClose} className="btn btn-secondary w-full">
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
}
