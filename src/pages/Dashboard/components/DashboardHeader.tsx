import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { ChevronRight, ChevronLeft, RefreshCw } from 'lucide-react';

interface DashboardHeaderProps {
  selectedMonth: Date;
  isCurrentMonth: boolean;
  onPreviousMonth: () => void;
  onNextMonth: () => void;
  onCurrentMonth: () => void;
  lastUpdated?: Date | null;
  refreshing?: boolean;
  onRefresh?: () => void;
}

export function DashboardHeader({
  selectedMonth,
  isCurrentMonth,
  onPreviousMonth,
  onNextMonth,
  onCurrentMonth,
  lastUpdated,
  refreshing,
  onRefresh,
}: DashboardHeaderProps) {
  return (
    <>
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-secondary-900">نظرة عامة</h2>
        <p className="text-sm text-secondary-500 mt-0.5">
          إحصائيات شهر {format(selectedMonth, 'MMMM yyyy', { locale: ar })}
        </p>
      </div>

      <div className="card py-3 px-4 flex items-center justify-between gap-3 flex-wrap">
        {/* اختيار الشهر: أسهم للتنقل شهر لشهر + رجوع سريع للشهر الحالي لو
            المستخدم مش واقف عليه أصلاً. الشهر التالي مقفول عند الوصول
            للشهر الحقيقي الحالي (مفيش بيانات مستقبلية لعرضها). */}
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={onPreviousMonth}
            aria-label="الشهر السابق"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-secondary-500 hover:bg-secondary-100 transition-colors"
          >
            <ChevronRight className="w-4 h-4" />
          </button>

          <div className="min-w-[110px] text-center">
            <span className="text-sm font-semibold text-secondary-800">
              {format(selectedMonth, 'MMMM yyyy', { locale: ar })}
            </span>
            {!isCurrentMonth && (
              <button
                type="button"
                onClick={onCurrentMonth}
                className="block mx-auto text-[11px] text-primary-600 hover:underline mt-0.5"
              >
                الرجوع للشهر الحالي
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={onNextMonth}
            disabled={isCurrentMonth}
            aria-label="الشهر التالي"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-secondary-500 hover:bg-secondary-100 disabled:opacity-30 disabled:hover:bg-transparent disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {onRefresh && (
          <div className="flex flex-col items-end gap-1">
            <button
              type="button"
              onClick={onRefresh}
              disabled={refreshing}
              className="flex items-center gap-1.5 text-xs md:text-sm font-medium text-primary-700 bg-primary-50 hover:bg-primary-100 disabled:opacity-60 disabled:cursor-not-allowed rounded-lg px-3 py-1.5 transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {refreshing ? 'جاري التحديث...' : 'تحديث'}
            </button>
            {lastUpdated && (
              <span className="text-[11px] text-secondary-400">
                آخر تحديث: {format(lastUpdated, 'hh:mm a', { locale: ar })}
              </span>
            )}
          </div>
        )}
      </div>
    </>
  );
}
