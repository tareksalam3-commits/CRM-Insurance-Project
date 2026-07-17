import { CheckCircle, Target, Clock } from 'lucide-react';
import type { DashboardStats } from '../types';
import { formatCurrency } from '../utils';

interface DashboardTargetsProps {
  stats: DashboardStats | null;
}

export function DashboardTargets({ stats }: DashboardTargetsProps) {
  return (
    <div className="card">
      <h3 className="font-semibold text-secondary-900 mb-4">التارجت</h3>
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-secondary-600">نسبة الإنجاز</span>
          <span className="text-lg font-bold text-secondary-900">
            {stats?.achievementRate || 0}%
          </span>
        </div>
        <div className="w-full bg-secondary-200 rounded-full h-3">
          <div
            className="bg-primary-600 h-3 rounded-full transition-all duration-500"
            style={{ width: `${Math.min(100, stats?.achievementRate || 0)}%` }}
          />
        </div>
        <div className="flex justify-between mt-2 text-sm text-secondary-500">
          <span>المحقق: {formatCurrency(stats?.achieved || 0)}</span>
          <span>التارجت: {formatCurrency(stats?.target || 0)}</span>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="text-center p-4 bg-success-50 rounded-lg">
          <CheckCircle className="w-8 h-8 text-success-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-success-700">
            {formatCurrency(stats?.achieved || 0)}
          </p>
          <p className="text-xs text-success-600 mt-1">المحقق</p>
        </div>
        <div className="text-center p-4 bg-warning-50 rounded-lg">
          <Target className="w-8 h-8 text-warning-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-warning-700">
            {formatCurrency(stats?.remaining || 0)}
          </p>
          <p className="text-xs text-warning-600 mt-1">المتبقي</p>
        </div>
        <div className="text-center p-4 bg-info-50 rounded-lg">
          <Clock className="w-8 h-8 text-info-600 mx-auto mb-2" />
          <p className="text-2xl font-bold text-info-700">
            {stats?.paidInstallmentsCount || 0}
          </p>
          <p className="text-xs text-info-600 mt-1">أقساط مسددة</p>
        </div>
      </div>
    </div>
  );
}
