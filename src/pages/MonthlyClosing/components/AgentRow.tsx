import { ChevronDown, ChevronUp } from 'lucide-react';
import clsx from 'clsx';
import { format } from 'date-fns';
import { ROLE_LABELS } from '../../../lib/supabase';
import type { AgentSummary } from '../types';
import { fmt } from '../utils';

export function AgentRow({ agent, expanded, onToggle }: {
  agent: AgentSummary;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-secondary-100 last:border-0">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-6 py-2.5 hover:bg-secondary-100 transition-colors text-right"
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-secondary-200 text-secondary-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
            {agent.name.charAt(0)}
          </div>
          <div>
            <p className="text-sm text-secondary-800">{agent.name}</p>
            <p className="text-xs text-secondary-400">{ROLE_LABELS[agent.role]} · {agent.details.length} عملية</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <span className="text-xs text-success-600 hidden sm:block">{fmt(agent.production)}</span>
          <span className="text-xs text-info-600 hidden sm:block">{fmt(agent.collection)}</span>
          <span className="text-sm font-semibold text-secondary-800">{fmt(agent.total)}</span>
          {expanded
            ? <ChevronUp className="w-3 h-3 text-secondary-400" />
            : <ChevronDown className="w-3 h-3 text-secondary-400" />}
        </div>
      </button>

      {expanded && agent.details.length > 0 && (
        <div className="px-6 pb-3 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-secondary-400 border-b border-secondary-100">
                <th className="text-right py-1.5 font-medium">العميل</th>
                <th className="text-right py-1.5 font-medium">رقم الوثيقة</th>
                <th className="text-right py-1.5 font-medium">رقم القسط</th>
                <th className="text-right py-1.5 font-medium">النوع</th>
                <th className="text-left py-1.5 font-medium">القيمة</th>
                <th className="text-left py-1.5 font-medium">تاريخ السداد</th>
              </tr>
            </thead>
            <tbody>
              {agent.details
                .sort((a, b) => new Date(a.paidAt).getTime() - new Date(b.paidAt).getTime())
                .map((d, i) => (
                  <tr key={i} className="border-b border-secondary-50 hover:bg-white transition-colors">
                    <td className="py-1.5 text-secondary-700">{d.customerName}</td>
                    <td className="py-1.5 text-secondary-600 font-mono" dir="ltr">{d.policyNumber}</td>
                    <td className="py-1.5 text-secondary-600 text-center">{d.installmentNumber}</td>
                    <td className="py-1.5">
                      <span className={clsx(
                        'badge text-xs',
                        d.type === 'new' ? 'badge-success' : 'badge-info'
                      )}>
                        {d.type === 'new' ? 'جديد' : 'تحصيل'}
                      </span>
                    </td>
                    <td className="py-1.5 text-left font-medium text-secondary-800">{fmt(d.amount)}</td>
                    <td className="py-1.5 text-left text-secondary-500" dir="ltr">
                      {format(new Date(d.paidAt), 'dd/MM/yyyy')}
                    </td>
                  </tr>
                ))}
            </tbody>
            <tfoot>
              <tr className="border-t border-secondary-200">
                <td colSpan={4} className="py-1.5 text-secondary-500 font-medium">الإجمالي</td>
                <td className="py-1.5 text-left font-bold text-primary-700">{fmt(agent.total)}</td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {expanded && agent.details.length === 0 && (
        <p className="px-6 pb-3 text-xs text-secondary-400">لا توجد مدفوعات لهذا الوكيل في هذا الشهر</p>
      )}
    </div>
  );
}
