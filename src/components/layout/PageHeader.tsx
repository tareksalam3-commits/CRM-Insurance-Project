import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  /** وصف فرعي أطول يظهر كسطر منفصل أسفل العنوان (مستخدم فى صفحات متعددة) */
  subtitle?: ReactNode;
  /** عنوان فرعي قصير يظهر بجوار العنوان الرئيسي مباشرة بنفس السطر (أو أسفله
   *  عند ضيق المساحة)، بخط أصغر وأخف وزناً — لتوضيح العنوان دون منافسته بصرياً */
  titleSuffix?: ReactNode;
  /** عنصر إجراء اختياري (مثل زر "إضافة") يظهر على يسار العنوان */
  action?: ReactNode;
}

/**
 * رأس صفحة عام (عنوان + وصف فرعي + إجراء اختياري).
 * استُخرج من الأنماط المتطابقة فى صفحات العملاء، الوثائق، التحصيل
 * والهيكل الوظيفي. لا يحمل أي منطق عمل.
 */
export function PageHeader({ title, subtitle, titleSuffix, action }: PageHeaderProps) {
  const titleBlock = (
    <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
      <h2 className="text-xl md:text-2xl font-bold text-secondary-900">{title}</h2>
      {titleSuffix && (
        <span className="text-sm md:text-base font-medium text-secondary-500">{titleSuffix}</span>
      )}
    </div>
  );

  if (!action) {
    return (
      <div>
        {titleBlock}
        {subtitle && <p className="text-sm text-secondary-500 mt-0.5">{subtitle}</p>}
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        {titleBlock}
        {subtitle && <p className="text-sm text-secondary-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}