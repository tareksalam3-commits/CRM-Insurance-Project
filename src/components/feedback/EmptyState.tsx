import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: ReactNode;
}

/**
 * مكوّن عام لعرض حالة "لا توجد بيانات" داخل بطاقة.
 * استُخرج من الأنماط المتطابقة في صفحات العملاء والوثائق والتحصيل.
 * لا يحمل أي منطق عمل — فقط العرض المرئي.
 */
export function EmptyState({ icon: Icon, title, description, action }: EmptyStateProps) {
  return (
    <div className="card text-center py-14">
      <div className="w-16 h-16 rounded-full bg-secondary-100 flex items-center justify-center mx-auto mb-4">
        <Icon className="w-8 h-8 text-secondary-400" />
      </div>
      <p className="text-secondary-600 font-medium">{title}</p>
      {description && (
        <p className="text-sm text-secondary-400 mt-1">{description}</p>
      )}
      {action}
    </div>
  );
}
