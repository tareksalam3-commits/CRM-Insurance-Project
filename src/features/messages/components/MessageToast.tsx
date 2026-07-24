import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import clsx from 'clsx';

interface ToastItem {
  id: number;
  message: string;
  kind: 'success' | 'error';
}

interface ToastContextValue {
  showSuccess: (message: string) => void;
  showError: (message: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Toast بسيط خاص بصفحة الرسائل فقط — لا يعتمد على أي مكتبة خارجية ولا يؤثر على باقي التطبيق */
export function MessageToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const push = useCallback((message: string, kind: ToastItem['kind']) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3000);
  }, []);

  const showSuccess = useCallback((message: string) => push(message, 'success'), [push]);
  const showError = useCallback((message: string) => push(message, 'error'), [push]);

  return (
    <ToastContext.Provider value={{ showSuccess, showError }}>
      {children}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 items-center pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              'flex items-center gap-2 px-4 py-2 rounded-xl shadow-lg text-sm text-white animate-fadeIn',
              t.kind === 'success' ? 'bg-secondary-900' : 'bg-error-600'
            )}
          >
            {t.kind === 'success' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <XCircle className="w-4 h-4 shrink-0" />}
            <span>{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useMessageToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    // احتياط بسيط: خارج الـ Provider لا نكسر الواجهة، فقط لا نعرض شيئاً
    return { showSuccess: () => {}, showError: () => {} };
  }
  return ctx;
}
