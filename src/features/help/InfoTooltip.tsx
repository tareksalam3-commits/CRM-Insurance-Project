import { useState, useRef, type ReactNode } from 'react';
import { Info } from 'lucide-react';
import clsx from 'clsx';

interface InfoTooltipProps {
  /** نص الشرح الذى يظهر فى التلميح */
  text: string;
  /**
   * الوضع "icon": يعرض أيقونة (i) صغيرة مستقلة بجوار العنصر (مناسب لعناوين
   * الحقول والبطاقات). الوضع "wrap": يلف عنصر موجود (زر/بطاقة/جدول) ويضيف
   * إمكانية الضغط المطوّل عليه لعرض نفس الشرح دون أيقونة إضافية ظاهرة.
   */
  mode?: 'icon' | 'wrap';
  children?: ReactNode;
  className?: string;
}

const LONG_PRESS_MS = 500;

/**
 * عنصر شرح صغير (Tooltip) قابل لإعادة الاستخدام على أي زر/حقل/بطاقة/جدول
 * فى التطبيق. لا يغيّر أي سلوك أو مظهر أصلي للعنصر الملفوف — فقط يضيف
 * طبقة شرح اختيارية فوقه.
 */
export function InfoTooltip({ text, mode = 'icon', children, className }: InfoTooltipProps) {
  const [visible, setVisible] = useState(false);
  const pressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const startPress = () => {
    pressTimer.current = setTimeout(() => setVisible(true), LONG_PRESS_MS);
  };
  const cancelPress = () => {
    if (pressTimer.current) clearTimeout(pressTimer.current);
  };

  const tooltip = visible && (
    <div
      role="tooltip"
      className="absolute z-50 bottom-full mb-1.5 right-0 w-56 max-w-[80vw] rounded-lg bg-secondary-900 text-white text-xs leading-relaxed p-2.5 shadow-elevated"
      onMouseLeave={() => setVisible(false)}
    >
      {text}
    </div>
  );

  if (mode === 'wrap' && children) {
    return (
      <span
        className={clsx('relative inline-block', className)}
        onMouseDown={startPress}
        onMouseUp={cancelPress}
        onMouseLeave={cancelPress}
        onTouchStart={startPress}
        onTouchEnd={cancelPress}
      >
        {children}
        {tooltip}
      </span>
    );
  }

  return (
    <span className={clsx('relative inline-flex items-center', className)}>
      {children}
      <button
        type="button"
        aria-label="شرح"
        onClick={(e) => { e.stopPropagation(); e.preventDefault(); setVisible((v) => !v); }}
        onMouseLeave={() => setVisible(false)}
        className="mr-1 text-secondary-400 hover:text-primary-600 transition-colors"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
      {tooltip}
    </span>
  );
}
