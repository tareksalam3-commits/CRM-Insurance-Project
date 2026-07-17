interface StatsCardSkeletonProps {
  /** عدد بطاقات الهيكل العظمي */
  count?: number;
  /** عرض شريط الرقم (كلاس Tailwind) */
  valueWidthClass?: string;
}

/**
 * هيكل تحميل عام لبطاقات الإحصائيات (KPI).
 * استُخرج من الأنماط المتطابقة فى صفحات العملاء والوثائق والتحصيل.
 */
export function StatsCardSkeleton({ count = 4, valueWidthClass = 'w-14' }: StatsCardSkeletonProps) {
  return (
    <>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="kpi-card animate-pulse">
          <div className="h-3.5 w-20 bg-secondary-200 rounded" />
          <div className={`h-6 ${valueWidthClass} bg-secondary-200 rounded mt-3`} />
        </div>
      ))}
    </>
  );
}
