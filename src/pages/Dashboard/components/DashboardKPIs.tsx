import { useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle, Percent, XCircle } from 'lucide-react';
import type { DashboardStats } from '../types';
import type { CancellationSummary } from '../../Cancellations/types';
import { formatCurrency } from '../utils';

interface DashboardKPIsProps {
  stats: DashboardStats | null;
  cancellationSummary: CancellationSummary | null;
}

export function DashboardKPIs({ stats, cancellationSummary }: DashboardKPIsProps) {
  const navigate = useNavigate();

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
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
