import { DollarSign, Layers } from 'lucide-react';
import clsx from 'clsx';

type YearMode = 'year1' | 'year2';

interface CollectionTabsProps {
  yearMode: YearMode;
  onChange: (mode: YearMode) => void;
}

// ===== تبويبا السنة الأولى / السنة الثانية =====
export function CollectionTabs({ yearMode, onChange }: CollectionTabsProps) {
  return (
    <div className="inline-flex p-1 rounded-xl bg-secondary-100 gap-1 w-full sm:w-auto">
      <button
        onClick={() => onChange('year1')}
        className={clsx(
          'flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2',
          yearMode === 'year1' ? 'bg-white text-primary-700 shadow-sm' : 'text-secondary-600 hover:text-secondary-900'
        )}
      >
        <DollarSign className="w-4 h-4" />
        <span>تحصيلات السنة الأولى</span>
      </button>
      <button
        onClick={() => onChange('year2')}
        className={clsx(
          'flex-1 sm:flex-none px-4 py-2 rounded-lg text-sm font-medium transition-all flex items-center justify-center gap-2',
          yearMode === 'year2' ? 'bg-white text-primary-700 shadow-sm' : 'text-secondary-600 hover:text-secondary-900'
        )}
      >
        <Layers className="w-4 h-4" />
        <span>تحصيلات السنة الثانية</span>
      </button>
    </div>
  );
}
