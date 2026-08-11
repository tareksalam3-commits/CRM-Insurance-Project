import { DollarSign, Layers } from 'lucide-react';
import clsx from 'clsx';

type YearMode = 'year1' | 'year2';

interface CollectionTabsProps {
  yearMode: YearMode;
  onChange: (mode: YearMode) => void;
}

/**
 * تبديل بصري مضغوط بين مساري التحصيل. لا يدمج أي بيانات أو حسابات:
 * السنة الأولى تستخدم الأقساط الأصلية، والسنوات اللاحقة تستخدم مسارها المنفصل.
 */
export function CollectionTabs({ yearMode, onChange }: CollectionTabsProps) {
  const tabs: Array<{
    id: YearMode;
    mobileTitle: string;
    desktopTitle: string;
    icon: typeof DollarSign;
  }> = [
    {
      id: 'year1',
      mobileTitle: 'السنة الأولى',
      desktopTitle: 'تحصيلات السنة الأولى',
      icon: DollarSign,
    },
    {
      id: 'year2',
      mobileTitle: 'السنة ٢+',
      desktopTitle: 'السنة الثانية وما بعدها',
      icon: Layers,
    },
  ];

  return (
    <div
      role="tablist"
      aria-label="اختيار مسار التحصيل"
      className="grid w-full grid-cols-2 gap-1.5"
    >
      {tabs.map(({ id, mobileTitle, desktopTitle, icon: Icon }) => {
        const isActive = yearMode === id;
        return (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={isActive}
            onClick={() => onChange(id)}
            className={clsx(
              'flex min-h-11 items-center justify-center gap-2 rounded-lg border px-2.5 py-2 text-xs font-bold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 sm:min-h-12 sm:px-4 sm:text-sm',
              isActive
                ? 'border-primary-600 bg-primary-600 text-white shadow-sm'
                : 'border-transparent bg-secondary-50 text-secondary-600 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700'
            )}
          >
            <Icon className="h-4 w-4 shrink-0 sm:h-[18px] sm:w-[18px]" />
            <span className="sm:hidden">{mobileTitle}</span>
            <span className="hidden sm:inline">{desktopTitle}</span>
          </button>
        );
      })}
    </div>
  );
}
