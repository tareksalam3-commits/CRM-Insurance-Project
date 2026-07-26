import { useEffect, useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { X } from 'lucide-react';
import { TOUR_STEPS } from './tourSteps';
import { useHelp, markTourCompleted } from './HelpContext';
import { useAuth } from '../../hooks/useAuth';

interface Rect { top: number; left: number; width: number; height: number }

function findRect(targetId: string): Rect | null {
  const el = document.querySelector(`[data-tour-id="${targetId}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

/**
 * الجولة التعريفية الأولى: تُظهر بقعة ضوء (Spotlight) حول العنصر المستهدف
 * فى كل خطوة، مع صندوق شرح مجاور له. تعمل فقط على المسارات التى عرّفتها
 * كل خطوة (TOUR_STEPS)، وتتخطى تلقائياً أي خطوة عنصرها غير موجود حالياً
 * فى الصفحة (مثال: أيقونة الرسائل مخفية عن مدير النظام).
 */
export function Tour() {
  const { isTourActive, stopTour } = useHelp();
  const { user } = useAuth();
  const location = useLocation();
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);

  const relevantSteps = TOUR_STEPS.filter((s) => s.path === location.pathname);
  const step = relevantSteps[stepIndex];

  const recomputeRect = useCallback(() => {
    if (!step) return;
    setRect(findRect(step.targetId));
  }, [step]);

  useEffect(() => {
    if (!isTourActive || !step) return;
    recomputeRect();
    window.addEventListener('resize', recomputeRect);
    return () => window.removeEventListener('resize', recomputeRect);
  }, [isTourActive, step, recomputeRect]);

  // تخطّى تلقائياً أي خطوة عنصرها غير موجود فعلياً فى الصفحة
  useEffect(() => {
    if (isTourActive && step && rect === null) {
      const t = setTimeout(() => {
        if (findRect(step.targetId) === null && stepIndex < relevantSteps.length - 1) {
          setStepIndex((i) => i + 1);
        }
      }, 300);
      return () => clearTimeout(t);
    }
  }, [isTourActive, step, rect, stepIndex, relevantSteps.length]);

  if (!isTourActive || !step) return null;

  const finish = () => {
    if (user) markTourCompleted(user.id);
    stopTour();
    setStepIndex(0);
  };

  const next = () => {
    if (stepIndex < relevantSteps.length - 1) setStepIndex((i) => i + 1);
    else finish();
  };

  const isLast = stepIndex === relevantSteps.length - 1;

  return (
    <div className="fixed inset-0 z-[60]">
      {/* الخلفية المعتمة، مع فتحة (بقعة ضوء) حول العنصر المستهدف */}
      <div className="absolute inset-0 bg-black/60 transition-all duration-200" />
      {rect && (
        <div
          className="absolute rounded-lg ring-4 ring-primary-500 bg-transparent transition-all duration-200 pointer-events-none"
          style={{
            top: rect.top - 6, left: rect.left - 6,
            width: rect.width + 12, height: rect.height + 12,
            boxShadow: '0 0 0 9999px rgba(0,0,0,0.6)',
          }}
        />
      )}

      {rect && (
        <div
          className="absolute bg-white rounded-xl shadow-elevated p-4 w-72 max-w-[85vw] z-10"
          style={{
            top: Math.min(rect.top + rect.height + 12, window.innerHeight - 180),
            left: Math.max(12, Math.min(rect.left, window.innerWidth - 300)),
          }}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <h4 className="font-semibold text-secondary-900 text-sm">{step.title}</h4>
            <button onClick={finish} aria-label="إغلاق الجولة" className="text-secondary-400 hover:text-secondary-700">
              <X className="w-4 h-4" />
            </button>
          </div>
          <p className="text-sm text-secondary-600 mb-3">{step.description}</p>
          <div className="flex items-center justify-between">
            <span className="text-xs text-secondary-400">{stepIndex + 1} / {relevantSteps.length}</span>
            <div className="flex gap-2">
              <button onClick={finish} className="btn-secondary text-xs px-3 py-1.5">تخطّى الجولة</button>
              <button onClick={next} className="btn-primary text-xs px-3 py-1.5">{isLast ? 'إنهاء' : 'التالي'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
