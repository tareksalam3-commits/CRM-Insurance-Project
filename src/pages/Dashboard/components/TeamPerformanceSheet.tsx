import { useEffect, useState } from 'react';
import { X, ArrowRight, Target, TrendingUp, DollarSign, BarChart3, Users, FileText } from 'lucide-react';
import clsx from 'clsx';
import { ROLE_LABELS } from '../../../lib/supabase';
import type { TeamMemberDetail } from '../types';
import { fetchAgentExtraStats } from '../services/dashboardService';

interface TeamPerformanceSheetProps {
  // سلسلة التنقل من الجذر (أول اسم تم الضغط عليه من بطاقة "أداء الفريق")
  // وحتى الشخص المعروض حاليًا — تُستخدم لزر الرجوع وشريط المسار
  stack: TeamMemberDetail[];
  // الأبناء المباشرون للشخص الحالي (فارغة لو كان وكيلاً وليس له فريق)
  children: TeamMemberDetail[];
  onSelectChild: (child: TeamMemberDetail) => void;
  onBack: () => void;
  onClose: () => void;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('ar-EG', {
    style: 'currency',
    currency: 'EGP',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);

function progressColor(rate: number) {
  if (rate >= 100) return 'bg-success-500';
  if (rate >= 70) return 'bg-warning-500';
  return 'bg-error-500';
}

export function TeamPerformanceSheet({ stack, children, onSelectChild, onBack, onClose }: TeamPerformanceSheetProps) {
  const current = stack[stack.length - 1];
  const isAgent = current.role === 'agent' || current.role === 'premium_agent';

  // إحصائيات الوكيل الإضافية (عدد العملاء/الوثائق) — Lazy Loading فعلي: لا
  // تُجلب إلا عند عرض تفاصيل وكيل بعينه، ومُخزَّنة محليًا حتى لا تتكرر
  // الاستعلامات لو رجع المستخدم لنفس الوكيل مرة أخرى داخل نفس الجلسة.
  const [agentExtraCache, setAgentExtraCache] = useState<Record<string, { customersCount: number; policiesCount: number }>>({});
  const [agentExtraLoading, setAgentExtraLoading] = useState(false);

  useEffect(() => {
    if (!isAgent || agentExtraCache[current.id]) return;
    let cancelled = false;
    setAgentExtraLoading(true);
    fetchAgentExtraStats(current.id)
      .then((stats) => {
        if (!cancelled) setAgentExtraCache((prev) => ({ ...prev, [current.id]: stats }));
      })
      .catch((error) => console.error('Error loading agent extra stats:', error))
      .finally(() => {
        if (!cancelled) setAgentExtraLoading(false);
      });
    return () => { cancelled = true; };
  }, [current.id, isAgent, agentExtraCache]);

  const agentExtra = agentExtraCache[current.id];

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content max-w-md animate-slideUp" onClick={(e) => e.stopPropagation()}>
        {/* Header + شريط المسار الهرمي */}
        <div className="sticky top-0 bg-white border-b border-secondary-200 px-4 py-3 z-10">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 min-w-0">
              {stack.length > 1 && (
                <button onClick={onBack} className="p-1.5 -mr-1.5 rounded-lg hover:bg-secondary-100 shrink-0">
                  <ArrowRight className="w-4 h-4 text-secondary-600" />
                </button>
              )}
              <span className="text-sm font-semibold text-secondary-900 truncate">تفاصيل الأداء</span>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-secondary-100 shrink-0">
              <X className="w-4 h-4 text-secondary-600" />
            </button>
          </div>
          {stack.length > 1 && (
            <div className="flex items-center gap-1 mt-1.5 overflow-x-auto scrollbar-thin text-[11px] text-secondary-400">
              {stack.map((m, i) => (
                <span key={m.id} className="flex items-center gap-1 shrink-0">
                  {i > 0 && <span>‹</span>}
                  <span className={i === stack.length - 1 ? 'text-primary-600 font-medium' : ''}>{m.name}</span>
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="p-4 space-y-4">
          {/* الاسم والدرجة الوظيفية */}
          <div className="text-center pt-1">
            <h4 className="text-lg font-bold text-secondary-900">{current.name}</h4>
            <span className="badge badge-secondary mt-1 inline-block">{ROLE_LABELS[current.role]}</span>
          </div>

          {/* الهدف الواحد + إجمالي المحقق + نسبة الإنجاز */}
          <div className="card bg-secondary-50/60 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="flex items-center gap-1.5 text-sm text-secondary-600">
                <Target className="w-4 h-4 text-secondary-500" /> الهدف
              </span>
              <span className="text-sm font-bold text-secondary-900">{formatCurrency(current.target)}</span>
            </div>
            <div className="w-full bg-secondary-200 rounded-full h-2.5 mb-2">
              <div
                className={clsx('h-2.5 rounded-full transition-all duration-500', progressColor(current.rate))}
                style={{ width: `${Math.min(100, current.rate)}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-secondary-500">
              <span>{formatCurrency(current.achieved)} / {formatCurrency(current.target)}</span>
              <span className="font-semibold text-secondary-700">{current.rate}%</span>
            </div>
          </div>

          {/* تفصيل مصدري التحقيق */}
          <div className="grid grid-cols-2 gap-3">
            <div className="card p-3 text-center">
              <TrendingUp className="w-5 h-5 text-warning-600 mx-auto mb-1.5" />
              <p className="text-sm font-bold text-secondary-900">{formatCurrency(current.newProduction)}</p>
              <p className="text-[11px] text-secondary-500 mt-0.5">المحقق من الإنتاج الجديد</p>
              <p className="text-[11px] text-error-600 mt-1 pt-1 border-t border-secondary-100">
                المتبقي من الجديد: {formatCurrency(current.remainingNewProduction)}
              </p>
            </div>
            <div className="card p-3 text-center">
              <DollarSign className="w-5 h-5 text-primary-600 mx-auto mb-1.5" />
              <p className="text-sm font-bold text-secondary-900">{formatCurrency(current.collection)}</p>
              <p className="text-[11px] text-secondary-500 mt-0.5">المحقق من التحصيل</p>
              <p className="text-[11px] text-error-600 mt-1 pt-1 border-t border-secondary-100">
                المتبقي من التحصيل: {formatCurrency(current.remainingCollection)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="card p-3 text-center bg-success-50/60">
              <BarChart3 className="w-5 h-5 text-success-600 mx-auto mb-1.5" />
              <p className="text-sm font-bold text-success-700">{formatCurrency(current.achieved)}</p>
              <p className="text-[11px] text-success-600 mt-0.5">إجمالي المحقق</p>
            </div>
            <div className="card p-3 text-center bg-warning-50/60">
              <Target className="w-5 h-5 text-warning-600 mx-auto mb-1.5" />
              <p className="text-sm font-bold text-warning-700">{formatCurrency(current.remaining)}</p>
              <p className="text-[11px] text-warning-600 mt-0.5">المتبقي على الهدف</p>
            </div>
          </div>

          {/* وكيل: عدد العملاء وعدد الوثائق (Lazy) */}
          {isAgent && (
            <div className="grid grid-cols-2 gap-3">
              <div className="card p-3 text-center">
                <Users className="w-5 h-5 text-info-600 mx-auto mb-1.5" />
                <p className="text-sm font-bold text-secondary-900">
                  {agentExtraLoading ? '…' : agentExtra?.customersCount ?? '—'}
                </p>
                <p className="text-[11px] text-secondary-500 mt-0.5">عدد العملاء</p>
              </div>
              <div className="card p-3 text-center">
                <FileText className="w-5 h-5 text-info-600 mx-auto mb-1.5" />
                <p className="text-sm font-bold text-secondary-900">
                  {agentExtraLoading ? '…' : agentExtra?.policiesCount ?? '—'}
                </p>
                <p className="text-[11px] text-secondary-500 mt-0.5">عدد الوثائق</p>
              </div>
            </div>
          )}

          {/* الفريق التابع — يظهر فقط لو كان لهذا الشخص أعضاء تحته */}
          {children.length > 0 && (
            <div>
              <p className="text-xs font-semibold text-secondary-400 mb-2">
                {current.role === 'group_leader' ? 'الوكلاء التابعون' : 'الفريق التابع'}
              </p>
              <div className="space-y-2">
                {children.map((child) => (
                  <button
                    key={child.id}
                    onClick={() => onSelectChild(child)}
                    className="w-full text-right pressable rounded-lg border border-secondary-100 p-3 hover:bg-secondary-50 transition-colors"
                  >
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-sm font-medium text-secondary-900 truncate">{child.name}</span>
                      <span className="text-xs text-secondary-500 shrink-0">{child.rate}%</span>
                    </div>
                    <div className="w-full bg-secondary-200 rounded-full h-1.5">
                      <div
                        className={clsx('h-1.5 rounded-full transition-all duration-500', progressColor(child.rate))}
                        style={{ width: `${Math.min(100, child.rate)}%` }}
                      />
                    </div>
                    <div className="flex justify-between mt-1">
                      <span className="text-[10px] text-secondary-400">{formatCurrency(child.achieved)}</span>
                      <span className="text-[10px] text-secondary-400">من {formatCurrency(child.target)}</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
