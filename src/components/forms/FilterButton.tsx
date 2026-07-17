import { SlidersHorizontal } from 'lucide-react';
import clsx from 'clsx';

interface FilterButtonProps {
  active: boolean;
  count: number;
  onClick: () => void;
  label?: string;
}

/**
 * زر فتح/تبديل لوحة الفلاتر مع شارة عدد الفلاتر النشطة.
 * استُخرج من الأنماط المتطابقة فى صفحات العملاء، الوثائق والتحصيل.
 */
export function FilterButton({ active, count, onClick, label = 'الفلاتر' }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      className={clsx('btn relative shrink-0', active || count > 0 ? 'btn-outline' : 'btn-secondary')}
    >
      <SlidersHorizontal className="w-4 h-4" />
      <span>{label}</span>
      {count > 0 && (
        <span className="absolute -top-1.5 -left-1.5 w-5 h-5 rounded-full bg-primary-600 text-white text-[11px] flex items-center justify-center">
          {count}
        </span>
      )}
    </button>
  );
}
