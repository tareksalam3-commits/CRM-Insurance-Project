import type { ReactNode, MouseEvent } from 'react';
import clsx from 'clsx';

interface AppDialogProps {
  /** يُستدعى عند الضغط خارج صندوق المحتوى. اتركه بدون تمرير لمنع الإغلاق (مثلاً أثناء التنفيذ). */
  onClose?: () => void;
  /** كلاسات إضافية على صندوق المحتوى (العرض الأقصى، الأنيميشن، أى تنسيق خاص بكل مودال) */
  className?: string;
  /** كلاسات إضافية على الخلفية نفسها (نادرًا ما تُستخدم، مثل print:hidden) */
  overlayClassName?: string;
  children: ReactNode;
}

/**
 * الغلاف العام لكل المودالات فى المشروع: خلفية معتمة + صندوق محتوى، مع إغلاق
 * عند الضغط خارج الصندوق ومنع انتشار الحدث (stopPropagation) عند الضغط داخله.
 * استُخرج من النمط المتطابق المتكرر فى عشرات المودالات بالمشروع.
 * لا يحمل أى تصميم داخلى أو منطق عمل — فقط الغلاف والسلوك المشترك؛ كل محتوى
 * المودال (الرأس، الفورم، الأزرار) يبقى كما هو تمامًا داخل الصفحة المستدعية.
 */
export function AppDialog({ onClose, className, overlayClassName, children }: AppDialogProps) {
  return (
    <div className={clsx('modal-overlay', overlayClassName)} onClick={onClose}>
      <div
        className={clsx('modal-content', className)}
        onClick={(e: MouseEvent) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>
  );
}
