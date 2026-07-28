import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { CheckCircle2, XCircle, HelpCircle, type LucideIcon } from 'lucide-react';
import clsx from 'clsx';
import { ConfirmDialog } from '../components/ui/ConfirmDialog';

interface ToastItem {
  id: number;
  message: string;
  kind: 'success' | 'error';
}

export interface NotifyConfirmOptions {
  icon?: LucideIcon;
  title?: string;
  message: ReactNode;
  warning?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ConfirmState {
  options: NotifyConfirmOptions;
  resolve: (value: boolean) => void;
}

interface NotifyContextValue {
  /** تنبيه نجاح (يحل محل alert('تم بنجاح...')) */
  success: (message: string) => void;
  /** تنبيه خطأ (يحل محل alert('حدث خطأ...')) */
  error: (message: string) => void;
  /**
   * تأكيد قبل تنفيذ عملية (يحل محل window.confirm()).
   * يمكن تمرير نص مباشرة أو كائن خيارات، ويرجع Promise<boolean>.
   */
  confirm: (options: NotifyConfirmOptions | string) => Promise<boolean>;
}

const NotifyContext = createContext<NotifyContextValue | null>(null);

const AUTO_DISMISS_MS = 3500;

/**
 * موفّر عام لرسائل النظام (نجاح/خطأ + تأكيد) بنفس أسلوب التصميم المستخدم
 * بالفعل فى المشروع (ConfirmDialog/AppDialog وأنماط الـ Toast العائم)،
 * بدل نوافذ alert()/confirm() الأصلية من المتصفح.
 * يُركَّب مرة واحدة فى جذر التطبيق (App.tsx).
 */
export function NotifyProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const [confirmState, setConfirmState] = useState<ConfirmState | null>(null);

  const push = useCallback((message: string, kind: ToastItem['kind']) => {
    const id = ++idRef.current;
    setToasts((prev) => [...prev, { id, message, kind }]);
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, AUTO_DISMISS_MS);
  }, []);

  const success = useCallback((message: string) => push(message, 'success'), [push]);
  const error = useCallback((message: string) => push(message, 'error'), [push]);

  const confirm = useCallback((options: NotifyConfirmOptions | string) => {
    const normalized: NotifyConfirmOptions = typeof options === 'string' ? { message: options } : options;
    return new Promise<boolean>((resolve) => {
      setConfirmState({ options: normalized, resolve });
    });
  }, []);

  const settleConfirm = (result: boolean) => {
    setConfirmState((current) => {
      current?.resolve(result);
      return null;
    });
  };

  return (
    <NotifyContext.Provider value={{ success, error, confirm }}>
      {children}

      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[70] flex flex-col gap-2 items-center pointer-events-none px-3">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={clsx(
              'pointer-events-auto flex items-center gap-2 px-4 py-2.5 rounded-xl shadow-lg text-sm text-white animate-fadeIn max-w-md',
              t.kind === 'success' ? 'bg-secondary-900' : 'bg-error-600',
            )}
          >
            {t.kind === 'success' ? (
              <CheckCircle2 className="w-4 h-4 shrink-0" />
            ) : (
              <XCircle className="w-4 h-4 shrink-0" />
            )}
            <span className="whitespace-pre-line">{t.message}</span>
          </div>
        ))}
      </div>

      {confirmState && (
        <ConfirmDialog
          icon={confirmState.options.icon ?? HelpCircle}
          title={confirmState.options.title ?? 'تأكيد العملية'}
          message={confirmState.options.message}
          warning={confirmState.options.warning}
          confirmLabel={confirmState.options.confirmLabel ?? 'تأكيد'}
          cancelLabel={confirmState.options.cancelLabel ?? 'إلغاء'}
          onConfirm={() => settleConfirm(true)}
          onClose={() => settleConfirm(false)}
        />
      )}
    </NotifyContext.Provider>
  );
}

export function useNotify(): NotifyContextValue {
  const ctx = useContext(NotifyContext);
  if (!ctx) {
    throw new Error('useNotify يجب أن تُستخدم داخل NotifyProvider');
  }
  return ctx;
}
