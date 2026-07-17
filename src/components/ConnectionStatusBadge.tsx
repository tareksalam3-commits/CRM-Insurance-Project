import { useConnectionStatus } from '../hooks/useConnectionStatus';
import clsx from 'clsx';

interface Props {
  /**
   * light = فوق خلفية غامقة (زي رأس الـ drawer)
   * dark  = نص فقط بدون خلفية (استخدام حر داخل عناصر تانية)
   * card  = بطاقة مستقلة بخلفية بيضاء ودائرة حالة ملوّنة (للسايدبار والـ drawer)
   */
  variant?: 'light' | 'dark' | 'card';
  className?: string;
}

// أخضر = متصل / أصفر = حالة وسيطة (منقطع مؤقتًا) / أحمر = خطأ حقيقي في الاتصال
const STATE_CONFIG = {
  connected:    { dot: 'bg-success-500', text: 'text-success-700', label: 'متصل' },
  disconnected: { dot: 'bg-warning-500', text: 'text-warning-700', label: 'غير متصل' },
  error:        { dot: 'bg-error-500',   text: 'text-error-700',   label: 'مشكلة في الاتصال' }
} as const;

export function ConnectionStatusBadge({ variant = 'dark', className }: Props) {
  const { state, minutesAgo } = useConnectionStatus();
  const cfg = STATE_CONFIG[state];
  const syncLabel = minutesAgo === 0 ? 'الآن' : `منذ ${minutesAgo} دقيقة`;

  if (variant === 'card') {
    return (
      <div
        className={clsx(
          'flex items-center gap-2.5 rounded-xl bg-white border border-secondary-100 px-3 py-2 shadow-sm',
          className
        )}
      >
        <span className="relative flex-shrink-0 flex items-center justify-center w-3 h-3">
          {state === 'connected' && (
            <span className={clsx('absolute inline-flex h-full w-full animate-ping rounded-full opacity-60', cfg.dot)} />
          )}
          <span className={clsx('relative inline-flex w-2 h-2 rounded-full', cfg.dot)} />
        </span>
        <div className="min-w-0 leading-tight">
          <p className={clsx('text-xs font-semibold truncate', cfg.text)}>{cfg.label}</p>
          <p className="text-[11px] text-secondary-400 mt-0.5">آخر مزامنة: {syncLabel}</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className}>
      <p
        className={clsx(
          'text-xs font-medium leading-tight flex items-center gap-1.5',
          variant === 'light' ? 'text-white' : cfg.text
        )}
      >
        <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', variant === 'light' ? 'bg-white' : cfg.dot)} />
        <span>{cfg.label}</span>
      </p>
      <p
        className={clsx(
          'text-[10px] leading-tight mt-0.5',
          variant === 'light' ? 'text-white/70' : 'text-secondary-400'
        )}
      >
        آخر مزامنة: {syncLabel}
      </p>
    </div>
  );
}
