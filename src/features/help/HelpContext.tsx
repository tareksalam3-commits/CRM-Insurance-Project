import { createContext, useContext, useState, useCallback, useMemo, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { getHelpForPath } from './content';
import type { HelpContent } from './types';

interface HelpContextValue {
  /** محتوى مساعدة الصفحة الحالية (حسب المسار)، إن وُجد */
  currentPageHelp: HelpContent | undefined;
  /** هل لوحة مساعدة الصفحة الحالية مفتوحة */
  isPanelOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  /** هل الجولة التعريفية شغّالة حالياً */
  isTourActive: boolean;
  startTour: () => void;
  stopTour: () => void;
}

const HelpContext = createContext<HelpContextValue | undefined>(undefined);

export function HelpProvider({ children }: { children: ReactNode }) {
  const location = useLocation();
  const [isPanelOpen, setPanelOpen] = useState(false);
  const [isTourActive, setTourActive] = useState(false);

  const currentPageHelp = useMemo(() => getHelpForPath(location.pathname), [location.pathname]);

  const openPanel = useCallback(() => setPanelOpen(true), []);
  const closePanel = useCallback(() => setPanelOpen(false), []);
  const startTour = useCallback(() => { setPanelOpen(false); setTourActive(true); }, []);
  const stopTour = useCallback(() => setTourActive(false), []);

  const value: HelpContextValue = {
    currentPageHelp, isPanelOpen, openPanel, closePanel, isTourActive, startTour, stopTour,
  };

  return <HelpContext.Provider value={value}>{children}</HelpContext.Provider>;
}

export function useHelp(): HelpContextValue {
  const ctx = useContext(HelpContext);
  if (!ctx) throw new Error('useHelp يجب أن يُستخدم داخل <HelpProvider>');
  return ctx;
}

/** مفتاح التخزين المحلي لتتبّع هل المستخدم أنهى/تخطّى الجولة التعريفية من قبل */
export function tourStorageKey(userId: string): string {
  return `crm:help:tour-completed:${userId}`;
}

export function hasCompletedTour(userId: string): boolean {
  try { return localStorage.getItem(tourStorageKey(userId)) === '1'; } catch { return true; }
}

export function markTourCompleted(userId: string): void {
  try { localStorage.setItem(tourStorageKey(userId), '1'); } catch { /* تجاهل بيئات بدون تخزين محلي */ }
}
