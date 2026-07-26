import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import { useHelp, hasCompletedTour } from './HelpContext';

/**
 * يبدأ الجولة التعريفية تلقائياً أول مرة يدخل فيها المستخدم للشاشة الرئيسية،
 * فقط إذا لم يكن قد أنهاها أو تخطّاها من قبل على هذا المتصفح.
 * يُستدعى مرة واحدة من AppLayout (وليس من كل صفحة).
 */
export function useFirstRunTour() {
  const { user } = useAuth();
  const location = useLocation();
  const { startTour, isTourActive } = useHelp();

  useEffect(() => {
    if (!user || isTourActive) return;
    if (location.pathname !== '/') return;
    if (hasCompletedTour(user.id)) return;
    const t = setTimeout(() => startTour(), 600); // تأخير بسيط لضمان اكتمال رسم الواجهة
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, location.pathname]);
}
