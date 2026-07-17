import { ChevronLeft, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (updater: (p: number) => number) => void;
  /** كلاس الحاوية (المسافات/الحدود)، افتراضيًا نفس التنسيق المستخدم فى أغلب الصفحات */
  className?: string;
}

/**
 * ترقيم صفحات عام (السابق / رقم الصفحة الحالية من الإجمالي / التالي).
 * استُخرج من الأنماط المتطابقة فى صفحات التحصيل، الوثائق، العملاء،
 * المستخدمين وسجل العمليات. لا يحمل أى منطق عمل — الصفحة الحالية والإجمالي
 * يُمرَّران من الصفحة المستدعية كما كانا تمامًا من قبل.
 */
export function Pagination({ page, totalPages, onPageChange, className = 'pt-2' }: PaginationProps) {
  if (totalPages <= 1) return null;
  return (
    <div className={clsx('flex items-center justify-between', className)}>
      <button
        onClick={() => onPageChange((p) => Math.max(1, p - 1))}
        disabled={page === 1}
        className="btn btn-ghost disabled:opacity-50"
      >
        <ChevronRight className="w-5 h-5" />
        <span>السابق</span>
      </button>
      <span className="text-sm text-secondary-600">
        صفحة {page} من {totalPages}
      </span>
      <button
        onClick={() => onPageChange((p) => Math.min(totalPages, p + 1))}
        disabled={page === totalPages}
        className="btn btn-ghost disabled:opacity-50"
      >
        <span>التالي</span>
        <ChevronLeft className="w-5 h-5" />
      </button>
    </div>
  );
}
