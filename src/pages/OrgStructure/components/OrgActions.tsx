import { Search, X, Download } from 'lucide-react';
import type { UserRole } from '../../../lib/supabase';
import { getVisibleRoleFilterOptions } from '../constants';

// ─── أدوات البحث والفلترة ────────────────────────────────
// أزرار "توسيع الكل/طي الكل" اتشالت — مالهاش معنى فى نظام التصفح الجديد
// (Drill-down) لأنك دايمًا شايف مستوى واحد بس فى المرة.
export function OrgActions({
  searchQuery, setSearchQuery, roleFilter, setRoleFilter, onDownloadClick, currentUserRole,
}: {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  roleFilter: UserRole | 'all';
  setRoleFilter: (r: UserRole | 'all') => void;
  onDownloadClick: () => void;
  currentUserRole: UserRole;
}) {
  const roleFilterOptions = getVisibleRoleFilterOptions(currentUserRole);
  return (
    <div className="card">
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="flex-1 relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-secondary-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="بحث بالاسم..."
            className="input-field pr-10 pl-9"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-secondary-400 hover:text-secondary-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
        <select
          value={roleFilter}
          onChange={(e) => setRoleFilter(e.target.value as UserRole | 'all')}
          className="input-field w-auto"
        >
          {roleFilterOptions.map((opt) => (
            <option key={opt.value} value={opt.value}>{opt.label}</option>
          ))}
        </select>
        <button type="button" onClick={onDownloadClick} className="btn btn-primary">
          <Download className="w-4 h-4" />
          <span>تنزيل التشكيل</span>
        </button>
      </div>
    </div>
  );
}
