import { ChevronRight } from 'lucide-react';
import clsx from 'clsx';
import type { RosterUser } from '../types';

// ─── شريط المسار (Breadcrumb) ────────────────────────────
// بيوضح "أنت واقف فين فى الهرم دلوقتي" ويسمح بالرجوع لأي مستوى سابق
// بضغطة واحدة، بدل ما تحتاج تقفل كل حاجة وتفتحها تاني.
export function OrgBreadcrumb({
  path,
  roster,
  onNavigate,
  onBack,
}: {
  path: string[];
  roster: Map<string, RosterUser>;
  onNavigate: (index: number) => void;
  onBack: () => void;
}) {
  if (path.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-1">
      {path.length > 1 && (
        <button
          type="button"
          onClick={onBack}
          className="flex-shrink-0 w-7 h-7 rounded-full bg-white border border-secondary-200 flex items-center justify-center hover:bg-secondary-50 active:scale-95 transition-all"
          aria-label="رجوع"
        >
          <ChevronRight className="w-4 h-4 text-secondary-600" />
        </button>
      )}
      <div className="flex items-center gap-1 overflow-x-auto scrollbar-thin">
        {path.map((id, i) => {
          const node = roster.get(id);
          if (!node) return null;
          const isLast = i === path.length - 1;
          return (
            <div key={id} className="flex items-center gap-1 flex-shrink-0">
              {i > 0 && <span className="text-secondary-300 text-xs">‹</span>}
              <button
                type="button"
                onClick={() => onNavigate(i)}
                disabled={isLast}
                className={clsx(
                  'whitespace-nowrap text-xs sm:text-sm px-1.5 py-0.5 rounded-md transition-colors',
                  isLast
                    ? 'font-bold text-primary-700 cursor-default'
                    : 'text-secondary-500 hover:text-secondary-700 hover:bg-secondary-100'
                )}
              >
                {node.name}
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
