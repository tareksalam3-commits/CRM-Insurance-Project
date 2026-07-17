import { RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { QUICK_FILTERS, type QuickFilter, type SubType, type OwnerFilter } from '../types';
import type { UserRole } from '../../../lib/supabase';
import { AgentCombobox } from '../../Customers/components/AgentCombobox';

interface CollectionFiltersProps {
  quickFilter: QuickFilter;
  onQuickFilterSelect: (id: QuickFilter) => void;

  showFilters: boolean;
  quickFilterDraft: QuickFilter;
  onQuickFilterDraftChange: (id: QuickFilter) => void;
  subTypeDraft: SubType;
  onSubTypeDraftChange: (v: SubType) => void;
  teamMembers: { id: string; name: string; role: UserRole }[];
  ownerFilterDraft: OwnerFilter;
  onOwnerFilterDraftChange: (id: OwnerFilter) => void;
  currentUserId: string | undefined;
  onResetFilters: () => void;
  onApplyFilters: () => void;

  isInitialLoading: boolean;
  totalCount: number;
  loading: boolean;
}

export function CollectionFilters({
  quickFilter,
  onQuickFilterSelect,
  showFilters,
  quickFilterDraft,
  onQuickFilterDraftChange,
  subTypeDraft,
  onSubTypeDraftChange,
  teamMembers,
  ownerFilterDraft,
  onOwnerFilterDraftChange,
  currentUserId,
  onResetFilters,
  onApplyFilters,
  isInitialLoading,
  totalCount,
  loading,
}: CollectionFiltersProps) {
  return (
    <>
      {/* شرائح سريعة لاختيار الفلتر مباشرة بدون فتح اللوحة */}
      <div className="flex gap-2 overflow-x-auto scrollbar-thin pb-1 -mx-1 px-1">
        {QUICK_FILTERS.map((f) => (
          <button
            key={f.id}
            onClick={() => onQuickFilterSelect(f.id)}
            className={clsx(
              'shrink-0 px-3.5 py-1.5 rounded-full text-sm font-medium border transition-colors',
              quickFilter === f.id
                ? 'bg-primary-600 border-primary-600 text-white'
                : 'bg-white border-secondary-200 text-secondary-600 hover:border-primary-300'
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {showFilters && (
        <div className="pt-3 border-t border-secondary-200 space-y-3 animate-fadeIn">
          <div>
            <label className="input-label">الفلتر</label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {QUICK_FILTERS.map((f) => (
                <button
                  key={f.id}
                  onClick={() => onQuickFilterDraftChange(f.id)}
                  className={clsx(
                    'px-3 py-2 rounded-lg text-sm font-medium border transition-colors',
                    quickFilterDraft === f.id
                      ? 'bg-primary-50 border-primary-500 text-primary-700'
                      : 'bg-white border-secondary-200 text-secondary-600'
                  )}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
          {(quickFilterDraft === 'month' || quickFilterDraft === 'paid') && (
            <div>
              <label className="input-label">النوع</label>
              <select
                value={subTypeDraft}
                onChange={(e) => onSubTypeDraftChange(e.target.value as SubType)}
                className="input-field"
              >
                <option value="all">الكل (إنتاج جديد + تحصيل دوري)</option>
                <option value="new">إنتاج جديد فقط</option>
                <option value="periodic">تحصيل دوري فقط</option>
              </select>
            </div>
          )}
          {teamMembers.length > 0 && (
            <div>
              <label className="input-label">الفريق</label>
              <AgentCombobox
                agents={teamMembers}
                value={ownerFilterDraft}
                onChange={(id) => onOwnerFilterDraftChange(id as OwnerFilter)}
                currentUserId={currentUserId}
                includeAllOption
                allOptionLabel="الكل"
                placeholder="اختر من فريقك"
              />
            </div>
          )}
          <div className="flex items-center justify-end gap-2">
            <button onClick={onResetFilters} className="btn btn-ghost btn-sm">
              <RefreshCw className="w-3.5 h-3.5" />
              <span>إعادة تعيين</span>
            </button>
            <button onClick={onApplyFilters} className="btn btn-primary btn-sm">
              تطبيق
            </button>
          </div>
        </div>
      )}

      {!isInitialLoading && (
        <p className="text-xs text-secondary-500 flex items-center gap-2">
          <span>عدد النتائج: <span className="font-semibold text-secondary-700">{totalCount}</span></span>
          {loading && (
            <span className="inline-flex items-center gap-1 text-secondary-400">
              <span className="w-3 h-3 rounded-full border-2 border-secondary-300 border-t-primary-500 animate-spin" />
              <span>جارِ التحديث...</span>
            </span>
          )}
        </p>
      )}
    </>
  );
}
