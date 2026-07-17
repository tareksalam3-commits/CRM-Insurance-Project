import { Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { formatCurrency } from '../utils';

interface DashboardChartsProps {
  totalPolicies: number;
  policyStatusData: { name: string; value: number; color: string }[];
  chartData: { production: number; collection: number };
}

export function DashboardCharts({ totalPolicies, policyStatusData, chartData }: DashboardChartsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="card">
        <h3 className="font-semibold text-secondary-900 mb-4">حالة الوثائق</h3>
        <div className="h-48 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={policyStatusData}
                cx="50%"
                cy="50%"
                innerRadius={50}
                outerRadius={70}
                paddingAngle={5}
                dataKey="value"
              >
                {policyStatusData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Pie>
              <Tooltip
                formatter={(value: any, name: any) => [value, name]}
                contentStyle={{
                  direction: 'rtl',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-xl font-bold text-secondary-900">
              {totalPolicies || 0}
            </span>
            <span className="text-[10px] text-secondary-400">إجمالي</span>
          </div>
        </div>
        <div className="flex justify-center gap-4 mt-2">
          {policyStatusData.map((entry) => (
            <div key={entry.name} className="flex items-center gap-1">
              <div
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="text-xs text-secondary-600">{entry.name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="card">
        <h3 className="font-semibold text-secondary-900 mb-4">الإنتاج والتحصيل هذا الشهر</h3>

        <div className="flex items-center justify-center gap-2 mb-3">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: '#22c55e' }} />
          <span className="text-sm font-medium text-secondary-700">
            الإنتاج الجديد: {formatCurrency(chartData.production)}
          </span>
        </div>

        <div className="h-56 relative">
          <ResponsiveContainer width="100%" height="100%">
            <PieChart>
              <Pie
                data={[
                  { name: 'الإنتاج الجديد', value: chartData.production, color: '#22c55e' },
                  { name: 'التحصيل الدوري', value: chartData.collection, color: '#3b82f6' }
                ]}
                dataKey="value"
                nameKey="name"
                cx="50%"
                cy="50%"
                innerRadius={55}
                outerRadius={85}
                paddingAngle={2}
              >
                <Cell fill="#22c55e" />
                <Cell fill="#3b82f6" />
              </Pie>
              <Tooltip
                formatter={(value: any) => formatCurrency(value)}
                contentStyle={{
                  direction: 'rtl',
                  borderRadius: '8px',
                  border: '1px solid #e2e8f0'
                }}
              />
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <span className="text-lg font-bold text-secondary-900">
              {formatCurrency(chartData.production + chartData.collection)}
            </span>
            <span className="text-[10px] text-secondary-400">الإجمالي</span>
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 mt-3">
          <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: '#3b82f6' }} />
          <span className="text-sm font-medium text-secondary-700">
            التحصيل الدوري: {formatCurrency(chartData.collection)}
          </span>
        </div>
      </div>
    </div>
  );
}
