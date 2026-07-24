import { TrendingUp, Wallet, Sparkles, AlertTriangle, RefreshCw, ShieldPlus, CalendarClock } from 'lucide-react';

import type { CalculationResult } from './pricingEngine';
import { formatCurrency, formatNumber } from './pricingEngine';
import {
  calculatePolicyBenefit,
  DEATH_BENEFIT_NOTICE,
  ACCIDENT_DOUBLING_NOTICE,
  QUARTERLY_WITHDRAWAL_NOTICE,
  QUATERNARY_DEATH_NOTICE,
} from './PolicyBenefits';

// ─── قسم "مزايا الوثيقة" — يظهر أسفل نتائج القسط مباشرة، ويختلف تلقائياً
// حسب نوع الوثيقة المختارة. لا يظهر إطلاقاً لمنتجات لا تملك مزايا محددة
// فى نطاق هذا التطوير (مثل معاش واطمئنان) حتى لا نعرض بيانات غير مؤكدة.
export function PolicyBenefits({ result }: { result: CalculationResult }) {
  const benefit = calculatePolicyBenefit(result);

  if (benefit.kind === 'none') return null;

  return (
    <div className="card print:hidden space-y-5 border-primary-100">
      <div className="flex items-center gap-2">
        <span className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary-50 text-primary-600 flex-shrink-0">
          <Sparkles className="w-5 h-5" />
        </span>
        <div>
          <h3 className="text-lg font-bold text-secondary-900">مزايا الوثيقة</h3>
          <p className="text-sm text-secondary-500 mt-0.5">{result.variant.familyLabel}</p>
        </div>
      </div>

      {benefit.kind === 'flat_profit' && (
        <>
          <div className="flex flex-wrap items-center gap-2">
            <span className="badge badge-primary flex items-center gap-1">
              <TrendingUp className="w-3.5 h-3.5" />
              نسبة الربح السنوى: {formatNumber(benefit.profitRatePct)}%
            </span>
            <span className="badge badge-secondary flex items-center gap-1">
              <CalendarClock className="w-3.5 h-3.5" />
              مدة الوثيقة: {benefit.termYears} سنة
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="kpi-card !p-4">
              <p className="text-xs text-secondary-500 mb-1">الأرباح السنوية</p>
              <p className="text-lg md:text-xl font-bold text-secondary-900">
                {formatCurrency(benefit.annualProfit)}
              </p>
            </div>
            <div className="kpi-card !p-4">
              <p className="text-xs text-secondary-500 mb-1">إجمالى الأرباح</p>
              <p className="text-lg md:text-xl font-bold text-secondary-900">
                {formatCurrency(benefit.totalProfit)}
              </p>
            </div>
            <div className="kpi-card !p-4 ring-1 ring-primary-100 bg-primary-50/40">
              <p className="text-xs text-primary-700 mb-1 font-medium">المتوقع فى نهاية المدة</p>
              <p className="text-lg md:text-xl font-bold text-primary-700">
                {formatCurrency(benefit.maturityAmount)}
              </p>
            </div>
          </div>

          {benefit.hasQuarterlyWithdrawal && (
            <div className="flex items-start gap-2.5 bg-info-50 border border-info-100 rounded-lg p-3 text-sm text-info-800">
              <RefreshCw className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{QUARTERLY_WITHDRAWAL_NOTICE}</span>
            </div>
          )}

          <div className="flex items-start gap-2.5 bg-warning-50 border border-warning-100 rounded-lg p-3 text-sm text-warning-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{DEATH_BENEFIT_NOTICE}</span>
          </div>

          {benefit.hasAccidentDoubling && (
            <div className="flex items-start gap-2.5 bg-warning-50 border border-warning-100 rounded-lg p-3 text-sm text-warning-800">
              <ShieldPlus className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>{ACCIDENT_DOUBLING_NOTICE}</span>
            </div>
          )}
        </>
      )}

      {benefit.kind === 'quaternary' && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="kpi-card !p-4">
              <p className="text-xs text-secondary-500 mb-1 flex items-center gap-1">
                <Wallet className="w-3.5 h-3.5" /> آخر كل 5 سنوات
              </p>
              <p className="text-lg md:text-xl font-bold text-secondary-900">
                {formatCurrency(benefit.periodicPayout)}
              </p>
              <p className="text-xs text-secondary-400 mt-1">ربع مبلغ التأمين</p>
            </div>
            <div className="kpi-card !p-4 ring-1 ring-primary-100 bg-primary-50/40">
              <p className="text-xs text-primary-700 mb-1 font-medium">المتوقع فى نهاية المدة</p>
              <p className="text-lg md:text-xl font-bold text-primary-700">
                {formatCurrency(benefit.maturityAmount)}
              </p>
              <p className="text-xs text-primary-500 mt-1">آخر ربع مستحق + 55% من مبلغ التأمين</p>
            </div>
          </div>

          <div className="flex items-start gap-2.5 bg-warning-50 border border-warning-100 rounded-lg p-3 text-sm text-warning-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>{QUATERNARY_DEATH_NOTICE}</span>
          </div>
        </>
      )}
    </div>
  );
}
