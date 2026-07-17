import { AlertTriangle, X, Trash2 } from 'lucide-react';
import type { User } from '../../../lib/supabase';
import { UserAvatar } from './UserAvatar';

interface DeleteUserModalProps {
  user: User;
  deleting: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export function DeleteUserModal({ user: u, deleting, onConfirm, onClose }: DeleteUserModalProps) {
  return (
    <div className="modal-overlay" onClick={deleting ? undefined : onClose}>
      <div
        className="modal-content max-w-md animate-fadeIn"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-secondary-200">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-lg bg-error-50 flex items-center justify-center shrink-0">
              <AlertTriangle className="w-5 h-5 text-error-600" />
            </div>
            <h3 className="text-lg font-semibold text-secondary-900">حذف المستخدم</h3>
          </div>
          <button onClick={onClose} disabled={deleting} className="p-2 rounded-lg hover:bg-secondary-100 disabled:opacity-50">
            <X className="w-5 h-5 text-secondary-600" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary-50 border border-secondary-100">
            <UserAvatar user={u} size="sm" />
            <div className="min-w-0">
              <p className="font-medium text-secondary-900 truncate">{u.name}</p>
              <p dir="ltr" className="text-xs text-secondary-500 truncate">{u.email}</p>
            </div>
          </div>

          <p className="text-sm text-secondary-600 leading-relaxed">
            سيتم حذف هذا المستخدم وإخفاؤه فوراً من صفحة المستخدمين والهيكل الوظيفي، ولن
            يتمكن من تسجيل الدخول أو استلام أي بيانات جديدة.
          </p>

          <div className="p-3 rounded-xl bg-info-50 border border-info-100 text-sm text-info-700 leading-relaxed">
            جميع البيانات المرتبطة به سابقاً (العملاء، الوثائق، الأقساط، التحصيل، العمولات،
            التقارير، تقفيل الشهر، سجل العمليات) ستبقى محفوظة كما هي دون أي تغيير.
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} disabled={deleting} className="btn btn-secondary flex-1">
              إلغاء
            </button>
            <button type="button" onClick={onConfirm} disabled={deleting} className="btn btn-error flex-1">
              {deleting ? (
                <>
                  <div className="w-4 h-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  <span>جاري الحذف...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-4 h-4" />
                  <span>تأكيد الحذف</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
