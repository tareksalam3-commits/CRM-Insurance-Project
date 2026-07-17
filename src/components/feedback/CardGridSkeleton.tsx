interface CardGridSkeletonProps {
  /** عدد بطاقات الهيكل العظمي المعروضة أثناء التحميل */
  count?: number;
  /** عرض شريط العنوان (كلاس Tailwind) */
  titleWidthClass?: string;
  /** إظهار شريط إضافي أسفل البطاقة (يُستخدم فى صفحة التحصيل لمحاكاة زر) */
  showFooterBar?: boolean;
}

/**
 * هيكل تحميل عام لشبكة البطاقات (Skeleton).
 * استُخرج من الأنماط المتطابقة تقريبًا فى صفحات العملاء والوثائق والتحصيل.
 */
export function CardGridSkeleton({
  count = 6,
  titleWidthClass = 'w-32',
  showFooterBar = false,
}: CardGridSkeletonProps) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="card animate-pulse space-y-3">
          <div className="flex items-center justify-between">
            <div className={`h-4 ${titleWidthClass} bg-secondary-200 rounded`} />
            <div className="h-5 w-16 bg-secondary-200 rounded-full" />
          </div>
          <div className="h-3 w-24 bg-secondary-200 rounded" />
          <div className="grid grid-cols-2 gap-3 mt-2">
            <div className="h-3 w-full bg-secondary-200 rounded" />
            <div className="h-3 w-full bg-secondary-200 rounded" />
            <div className="h-3 w-full bg-secondary-200 rounded" />
            <div className="h-3 w-full bg-secondary-200 rounded" />
          </div>
          {showFooterBar && (
            <div className="h-9 w-full bg-secondary-200 rounded-lg mt-2" />
          )}
        </div>
      ))}
    </div>
  );
}
