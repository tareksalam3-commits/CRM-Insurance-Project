import { RefreshCw } from 'lucide-react';
import { POLICY_TYPE_LABELS } from '../../../lib/supabase';

interface PoliciesFiltersProps {
  statusDraft: string;
  onStatusDraftChange: (value: string) => void;
  typeDraft: string;
  onTypeDraftChange: (value: string) => void;
  monthDraft: string;
  onMonthDraftChange: (value: string) => void;
  monthOptions: { value: string; label: string }[];
  onApply: () => void;
  onReset: () => void;
}

export function PoliciesFilters({
  statusDraft,
  onStatusDraftChange,
  typeDraft,
  onTypeDraftChange,
  monthDraft,
  onMonthDraftChange,
  monthOptions,
  onApply,
  onReset,
}: PoliciesFiltersProps) {
  return (
    <div className="pt-3 border-t border-secondary-200 space-y-3 animate-fadeIn">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="input-label">حالة الوثيقة</label>
          <select
            value={statusDraft}
            onChange={(e) => onStatusDraftChange(e.target.value)}
            className="input-field"
          >
            <option value="all">جميع الحالات</option>
            <option value="active">نشط</option>
            <option value="cancelled">ملغى</option>
          </select>
        </div>
        <div>
          <label className="input-label">نوع الوثيقة</label>
          <select
            value={typeDraft}
            onChange={(e) => onTypeDraftChange(e.target.value)}
            className="input-field"
          >
            <option value="all">جميع الأنواع</option>
            {Object.entries(POLICY_TYPE_LABELS).map(([value, label]) => (
              <option key={value} value={value}>{label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="input-label">الشهر</label>
          <select
            value={monthDraft}
            onChange={(e) => onMonthDraftChange(e.target.value)}
            className="input-field"
          >
            <option value="all">كل الشهور</option>
            {monthOptions.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <button onClick={onReset} className="btn btn-ghost btn-sm">
          <RefreshCw className="w-3.5 h-3.5" />
          <span>إعادة تعيين</span>
        </button>
        <button onClick={onApply} className="btn btn-primary btn-sm">
          تطبيق
        </button>
      </div>
    </div>
  );
}
