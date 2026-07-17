import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: ReactNode;
  /** عنصر إجراء اختياري (مثل زر "إضافة") يظهر على يسار العنوان */
  action?: ReactNode;
}

/**
 * رأس صفحة عام (عنوان + وصف فرعي + إجراء اختياري).
 * استُخرج من الأنماط المتطابقة فى صفحات العملاء، الوثائق، التحصيل
 * والهيكل الوظيفي. لا يحمل أي منطق عمل.
 */
export function PageHeader({ title, subtitle, action }: PageHeaderProps) {
  if (!action) {
    return (
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-secondary-900">{title}</h2>
        {subtitle && <p className="text-sm text-secondary-500 mt-0.5">{subtitle}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <h2 className="text-xl md:text-2xl font-bold text-secondary-900">{title}</h2>
        {subtitle && <p className="text-sm text-secondary-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}
