import { useConnectionStatus } from '../hooks/useConnectionStatus';
import clsx from 'clsx';

interface Props {
  /** light = فوق خلفية غامقة (زي شريط الموبايل)، dark = فوق خلفية بيضاء (السايدبار) */
  variant?: 'light' | 'dark';
  className?: string;
}

export function ConnectionStatusBadge({ variant = 'dark', className }: Props) {
  const { state, minutesAgo } = useConnectionStatus();

  const config = {
    connected: { dot: '🟢', label: 'متصل' },
    disconnected: { dot: '🟠', label: 'غير متصل' },
    error: { dot: '🔴', label: 'مشكلة في الاتصال' }
  }[state];

  const syncLabel = minutesAgo === 0 ? 'الآن' : `منذ ${minutesAgo} دقيقة`;

  return (
    <div className={className}>
      <p
        className={clsx(
          'text-xs font-medium leading-tight flex items-center gap-1',
          variant === 'light' ? 'text-white' : 'text-secondary-700'
        )}
      >
        <span className="text-[10px]">{config.dot}</span>
        <span>{config.label}</span>
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
