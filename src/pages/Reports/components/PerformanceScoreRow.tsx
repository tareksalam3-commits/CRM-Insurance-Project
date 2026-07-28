import clsx from 'clsx';

// صف واحد فى قائمة "أداء الوكلاء/رؤساء المجموعات/المراقبين" بملخص التقرير:
// يعرض "التقييم الشامل" (المدمج) كرقم رئيسي، مع تفصيل بسيط تحته (النسبة
// المالية ودرجة النشاط)، وتنويه واضح لو الدرجة اعتمدت على المالي فقط لعدم
// وجود بيانات نشاط مسجَّلة فى الفترة
export function PerformanceScoreRow({
  name,
  subLabel,
  entry,
}: {
  name: string;
  subLabel?: string;
  entry: {
    finalScore: number; financialRate: number; activityScore: number | null;
    financialOnly: boolean; ratingLabel: string; ratingColorClass: string;
    activity?: {
      hasData: boolean; punctualityPct: number;
      appointmentsQualityTotal: number; appointmentsQualityScore: number | null; appointmentsQualityLabel: string;
    };
  };
}) {
  const activity = entry.activity;
  const showQuality = activity?.hasData && activity.appointmentsQualityTotal > 0;

  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-secondary-600">
        {name} {subLabel && <span className="text-xs text-secondary-400">({subLabel})</span>}
      </span>
      <div className="text-left">
        <div className="flex items-center gap-2 justify-end">
          <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', entry.ratingColorClass)}>
            {entry.ratingLabel}
          </span>
          <span className="font-semibold">{entry.finalScore}%</span>
        </div>
        <p className="text-[11px] text-secondary-400 mt-0.5">
          {entry.financialOnly
            ? 'مالي فقط — لا توجد بيانات نشاط'
            : `مالي ${entry.financialRate}% • نشاط ${entry.activityScore}%`}
        </p>
        {activity?.hasData && (
          <p className="text-[11px] text-secondary-400 mt-0.5">
            الالتزام {activity.punctualityPct}%
            {showQuality && ` • جودة المواعيد ${activity.appointmentsQualityScore}% (${activity.appointmentsQualityLabel})`}
          </p>
        )}
      </div>
    </div>
  );
}
