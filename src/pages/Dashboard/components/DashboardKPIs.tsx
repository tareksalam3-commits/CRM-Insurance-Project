import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle, Percent, TrendingUp, XCircle } from 'lucide-react';
import type { DashboardStats } from '../types';
import type { CancellationSummary } from '../../Cancellations/types';
import { formatCurrency } from '../utils';

interface DashboardKPIsProps {
  stats: DashboardStats | null;
  cancellationSummary: CancellationSummary | null;
}

// ألوان بطاقة "معدل التحصيل" بتتغيّر حسب النسبة نفسها (مش لون ثابت زي باقي
// الكروت) عشان تدّي إشارة بصرية فورية: أخضر = تحصيل جيد، برتقالي = متوسط،
// أحمر = ضعيف ويحتاج متابعة. الحدود (80% / 50%) اختيار عملي بسيط قابل
// للتعديل لاحقاً لو الإدارة حبت تغيّره.
function collectionRateColor(rate: number): { border: string; text: string } {
  if (rate >= 80) return { border: 'border-r-success-500', text: 'text-success-600' };
  if (rate >= 50) return { border: 'border-r-warning-500', text: 'text-warning-600' };
  return { border: 'border-r-error-500', text: 'text-error-600' };
}

export function DashboardKPIs({ stats, cancellationSummary }: DashboardKPIsProps) {
  const navigate = useNavigate();
  const rate = stats?.collectionRate ?? 0;
  const rateColor = collectionRateColor(rate);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 md:gap-4">
        <button
          type="button"
          onClick={() => navigate('/collection?quickFilter=month')}
          className={`kpi-card text-right w-full cursor-pointer hover:-translate-y-0.5 active:translate-y-0 border-r-4 ${rateColor.border}`}
        >
          <div className="flex items-center justify-between">
            <p className="text-xs md:text-sm text-secondary-500">معدل التحصيل الشهري</p>
            <TrendingUp className={`w-4 h-4 ${rateColor.text} shrink-0`} />
          </div>
          <p className={`text-xl md:text-2xl font-bold mt-1.5 ${rateColor.text}`}>
            {rate}%
          </p>
          <p className="text-[11px] md:text-xs text-secondary-400 mt-1">
            {formatCurrency(stats?.paidInstallments || 0)} مسدد من مستحقات الشهر
          </p>
        </button>

        <button
          type="button"
          onClick={() => navigate('/collection?quickFilter=month')}
          className="kpi-card text-right w-full cursor-pointer hover:-translate-y-0.5 active:translate-y-0 border-r-4 border-r-warning-500"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs md:text-sm text-secondary-500">الأقساط المستحقة</p>
            <AlertCircle className="w-4 h-4 text-warning-500 shrink-0" />
          </div>
          <p className="text-xl md:text-2xl font-bold text-secondary-900 mt-1.5">
            {formatCurrency(stats?.dueInstallments || 0)}
          </p>
          <p className="text-[11px] md:text-xs text-secondary-400 mt-1">
            {stats?.dueInstallmentsCount || 0} قسط
          </p>
        </button>

        <button
          type="button"
          onClick={() => navigate('/collection?quickFilter=overdue')}
          className="kpi-card text-right w-full cursor-pointer hover:-translate-y-0.5 active:translate-y-0 border-r-4 border-r-error-500"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs md:text-sm text-secondary-500">الأقساط المتأخرة</p>
            <AlertCircle className="w-4 h-4 text-error-500 shrink-0" />
          </div>
          <p className="text-xl md:text-2xl font-bold text-secondary-900 mt-1.5">
            {formatCurrency(stats?.overdueInstallments || 0)}
          </p>
          <p className="text-[11px] md:text-xs text-secondary-400 mt-1">
            {stats?.overdueInstallmentsCount || 0} قسط
          </p>
        </button>

        <button
          type="button"
          onClick={() => navigate('/collection?quickFilter=paid')}
          className="kpi-card text-right w-full cursor-pointer hover:-translate-y-0.5 active:translate-y-0 border-r-4 border-r-success-500"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs md:text-sm text-secondary-500">الأقساط المسددة</p>
            <CheckCircle className="w-4 h-4 text-success-500 shrink-0" />
          </div>
          <p className="text-xl md:text-2xl font-bold text-success-600 mt-1.5">
            {formatCurrency(stats?.paidInstallments || 0)}
          </p>
          <p className="text-[11px] md:text-xs text-secondary-400 mt-1">
            {stats?.paidInstallmentsCount || 0} قسط
          </p>
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <button
          type="button"
          onClick={() => navigate('/cancellations')}
          className="kpi-card text-right w-full cursor-pointer hover:-translate-y-0.5 active:translate-y-0 border-r-4 border-r-error-500"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs md:text-sm text-secondary-500">نسبة الإلغاءات</p>
            <Percent className="w-4 h-4 text-error-500 shrink-0" />
          </div>
          <p className="text-xl md:text-2xl font-bold text-error-600 mt-1.5">
            {cancellationSummary?.cancellationRate ?? 0}%
          </p>
        </button>

        <button
          type="button"
          onClick={() => navigate('/cancellations')}
          className="kpi-card text-right w-full cursor-pointer hover:-translate-y-0.5 active:translate-y-0 border-r-4 border-r-error-500"
        >
          <div className="flex items-center justify-between">
            <p className="text-xs md:text-sm text-secondary-500">قيمة الإلغاءات</p>
            <XCircle className="w-4 h-4 text-error-500 shrink-0" />
          </div>
          <p className="text-lg md:text-2xl font-bold text-error-600 mt-1.5 truncate">
            {formatCurrency(cancellationSummary?.cancelledValue || 0)}
          </p>
        </button>
      </div>
    </>
  );
}
