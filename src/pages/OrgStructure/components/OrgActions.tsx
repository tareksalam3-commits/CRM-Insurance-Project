import { Maximize2, Minimize2, Search, Loader2, X, Download } from 'lucide-react';
import type { UserRole } from '../../../lib/supabase';
import { getVisibleRoleFilterOptions } from '../constants';
import type { RosterUser } from '../types';

// ─── أدوات البحث والفلترة ────────────────────────────────
export function OrgActions({
  searchQuery, setSearchQuery, roleFilter, setRoleFilter,
  expandAll, expandingAll, collapseAll, onDownloadClick, matches, currentUserRole,
}: {
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  roleFilter: UserRole | 'all';
  setRoleFilter: (r: UserRole | 'all') => void;
  expandAll: () => void;
  expandingAll: boolean;
  collapseAll: () => void;
  onDownloadClick: () => void;
  matches: RosterUser[] | null;
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
        <div className="flex gap-2">
          <button
            onClick={expandAll}
            disabled={expandingAll}
            className="btn btn-ghost text-secondary-600 flex-1 sm:flex-none"
          >
            {expandingAll ? <Loader2 className="w-4 h-4 animate-spin" /> : <Maximize2 className="w-4 h-4" />}
            <span>توسيع الكل</span>
          </button>
          <button onClick={collapseAll} className="btn btn-ghost text-secondary-600 flex-1 sm:flex-none">
            <Minimize2 className="w-4 h-4" />
            <span>طي الكل</span>
          </button>
          <button onClick={onDownloadClick} className="btn btn-primary flex-1 sm:flex-none">
            <Download className="w-4 h-4" />
            <span>تنزيل التشكيل</span>
          </button>
        </div>
      </div>
      {matches && (
        <p className="text-xs text-secondary-500 mt-3">
          {matches.length > 0
            ? `${matches.length} نتيجة مطابقة — تم فتح المسار حتى مكانهم في الهيكل`
            : 'لا توجد نتائج مطابقة'}
        </p>
      )}
    </div>
  );
}
