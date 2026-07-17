import { useEffect, useState } from 'react';
import { WifiOff, CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import clsx from 'clsx';
import { subscribeOfflineEvents, type OfflineEventDetail } from '../lib/offlineEvents';

const AUTO_DISMISS_MS = 4000;

const KIND_CONFIG = {
  queued:      { icon: WifiOff,      className: 'bg-secondary-800 text-white' },
  'sync-started': { icon: RefreshCw, className: 'bg-primary-600 text-white' },
  synced:      { icon: CheckCircle2, className: 'bg-success-600 text-white' },
  conflict:    { icon: AlertTriangle, className: 'bg-error-600 text-white' },
  'data-cached': { icon: WifiOff,    className: 'bg-secondary-800 text-white' },
} as const;

// ===================================
// إشعار عائم بسيط لأحداث طابور الأوفلاين — لا يعتمد على أي شاشة بعينها،
// مركّب مرة واحدة فى جذر التطبيق (App.tsx)
// ===================================
export function OfflineToast() {
  const [toast, setToast] = useState<OfflineEventDetail | null>(null);

  useEffect(() => {
    let dismissTimer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeOfflineEvents((detail) => {
      setToast(detail);
      if (dismissTimer) clearTimeout(dismissTimer);
      dismissTimer = setTimeout(() => setToast(null), AUTO_DISMISS_MS);
    });
    return () => {
      unsubscribe();
      if (dismissTimer) clearTimeout(dismissTimer);
    };
  }, []);

  if (!toast) return null;

  const { icon: Icon, className } = KIND_CONFIG[toast.kind];

  return (
    <div className="fixed bottom-24 md:bottom-6 inset-x-0 flex justify-center z-[60] px-3 pointer-events-none">
      <div
        className={clsx(
          'pointer-events-auto flex items-center gap-2.5 rounded-xl shadow-lg px-4 py-3 max-w-md animate-fadeIn',
          className,
        )}
      >
        <Icon className="w-5 h-5 flex-shrink-0" />
        <p className="text-sm font-medium leading-tight">{toast.message}</p>
      </div>
    </div>
  );
}
