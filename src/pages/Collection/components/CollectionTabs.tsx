import { DollarSign, Layers } from 'lucide-react';
import clsx from 'clsx';

type YearMode = 'year1' | 'year2';

interface CollectionTabsProps {
  yearMode: YearMode;
  onChange: (mode: YearMode) => void;
}

/**
 * تبديل بصري فقط بين مساري التحصيل. لا يدمج أي بيانات أو حسابات:
 * السنة الأولى تستخدم الأقساط الأصلية، والسنوات اللاحقة تستخدم مسارها المنفصل.
 */
export function CollectionTabs({ yearMode, onChange }: CollectionTabsProps) {
  const tabs: Array<{
    id: YearMode;
    title: string;
    description: string;
    icon: typeof DollarSign;
  }> = [
    {
      id: 'year1',
      title: 'السنة الأولى',
      description: 'الأقساط والحسابات الأساسية',
      icon: DollarSign,
    },
    {
      id: 'year2',
      title: 'السنة الثانية وما بعدها',
      description: 'تحصيل منفصل للسنوات اللاحقة',
      icon: Layers,
    },
  ];

  return (
    <div
      role="tablist"
      aria-label="اختيار مسار التحصيل"
      className="grid w-full grid-cols-1 gap-2 rounded-xl bg-secondary-100 p-2 sm:grid-cols-2"
    >
      {tabs.map(({ id, title, description, icon: Icon }) => {
        const isActive = yearMode === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(id)}
            className={clsx(
              'group flex min-h-16 items-center gap-3 rounded-lg border px-3.5 py-3 text-right transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2',
              isActive
                ? 'border-primary-600 bg-primary-600 text-white shadow-md shadow-primary-200'
                : 'border-transparent bg-white text-secondary-700 hover:border-primary-200 hover:bg-primary-50/60'
            )}
          >
            <span
              className={clsx(
                'flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition-colors',
                isActive ? 'bg-white/15 text-white' : 'bg-primary-100 text-primary-700 group-hover:bg-primary-200'
              )}
            >
              <Icon className="h-5 w-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-bold">{title}</span>
              <span className={clsx('mt-0.5 block text-xs', isActive ? 'text-primary-100' : 'text-secondary-500')}>
                {description}
              </span>
            </span>
            {isActive && <span className="text-xs font-semibold text-primary-100">مفتوح الآن</span>}
          </button>
        );
      })}
    </div>
  );
}
