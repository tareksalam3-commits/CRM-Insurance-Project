import clsx from 'clsx';
import type { TeamPerformance, TeamMemberDetail } from '../types';
import { formatCurrency } from '../utils';
import { TeamPerformanceSheet } from './TeamPerformanceSheet';

interface DashboardPerformanceProps {
  teamPerformanceSections: { label: string; members: TeamPerformance[] }[];
  sheetStack: TeamMemberDetail[];
  getChildrenDetails: (personId: string) => TeamMemberDetail[];
  openTeamMemberSheet: (personId: string) => void;
  handleSelectChild: (child: TeamMemberDetail) => void;
  handleSheetBack: () => void;
  handleSheetClose: () => void;
}

// شرائح الأداء: أحمر لحد ٥٩٪، أصفر من ٦٠٪ لحد ٩٩٪، أخضر من ١٠٠٪ لحد ١٥٠٪،
// ومن ١٥١٪ فأكثر تدرج بنفسجي مميز يبرز الأداء الاستثنائي عن باقي الفريق
function getPerformanceTier(rate: number): 'exceptional' | 'success' | 'warning' | 'error' {
  if (rate >= 151) return 'exceptional';
  if (rate >= 100) return 'success';
  if (rate >= 60) return 'warning';
  return 'error';
}

const TIER_BAR_CLASS: Record<ReturnType<typeof getPerformanceTier>, string> = {
  exceptional: 'bg-gradient-to-r from-violet-500 to-indigo-600',
  success: 'bg-success-500',
  warning: 'bg-warning-500',
  error: 'bg-error-500',
};

const TIER_TEXT_CLASS: Record<ReturnType<typeof getPerformanceTier>, string> = {
  exceptional: 'text-indigo-600 font-bold',
  success: 'text-success-700',
  warning: 'text-warning-700',
  error: 'text-error-600',
};

// وصف نصي مختصر لكل شريحة أداء، بيتعرض بجانب الميدالية لأول ٣ ترتيب فقط
// (زيادة مؤشر أداء واحد بسيط فوق النسبة المئوية، بدون أي بيانات جديدة).
const TIER_LABEL: Record<ReturnType<typeof getPerformanceTier>, string> = {
  exceptional: 'أداء استثنائي',
  success: 'محقق الهدف',
  warning: 'دون الهدف',
  error: 'يحتاج متابعة',
};

// ميداليات أول ٣ ترتيب فقط (ذهبي/فضي/برونزي) — بديل أوضح بصريًا من الرقم
// المجرد، مع خلفية متدرجة تميّز صاحب المركز الأول تحديدًا عن باقي القائمة.
const RANK_MEDAL: Record<number, { emoji: string; label: string; badge: string; row: string }> = {
  0: { emoji: '🥇', label: 'الأول', badge: 'bg-gradient-to-br from-amber-300 to-amber-500 shadow-sm', row: 'bg-gradient-to-l from-amber-50 to-transparent' },
  1: { emoji: '🥈', label: 'الثاني', badge: 'bg-gradient-to-br from-slate-300 to-slate-400', row: '' },
  2: { emoji: '🥉', label: 'الثالث', badge: 'bg-gradient-to-br from-orange-300 to-orange-500', row: '' },
};

export function DashboardPerformance({
  teamPerformanceSections,
  sheetStack,
  getChildrenDetails,
  openTeamMemberSheet,
  handleSelectChild,
  handleSheetBack,
  handleSheetClose,
}: DashboardPerformanceProps) {
  return (
    <>
      <div className="card">
        <h3 className="font-semibold text-secondary-900 mb-4">إحصائيات الفريق</h3>
        <div className="space-y-5">
          {teamPerformanceSections.length === 0 ? (
            <p className="text-center text-secondary-500 py-4">لا توجد بيانات</p>
          ) : (
            teamPerformanceSections.map((section) => (
              <div key={section.label}>
                {teamPerformanceSections.length > 1 && (
                  <p className="text-xs font-semibold text-secondary-400 mb-3">{section.label}</p>
                )}
                <div className="space-y-4">
                  {section.members.map((member, index) => {
                    const rate = member.target > 0
                      ? Math.round((member.achieved / member.target) * 100)
                      : 0;
                    const tier = getPerformanceTier(rate);
                    const medal = RANK_MEDAL[index];
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => openTeamMemberSheet(member.id)}
                        className={clsx(
                          'w-full flex items-center gap-3 text-right pressable rounded-lg -mx-1 px-1 py-1 hover:bg-secondary-50 transition-colors',
                          medal?.row
                        )}
                      >
                        <div className="w-8 text-center shrink-0">
                          {medal ? (
                            <>
                              <span
                                className={clsx(
                                  'inline-flex items-center justify-center w-7 h-7 rounded-full text-sm',
                                  medal.badge
                                )}
                              >
                                {medal.emoji}
                              </span>
                              <span className="block text-[9px] font-semibold text-secondary-500 mt-0.5">
                                {medal.label}
                              </span>
                            </>
                          ) : (
                            <span className="inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold bg-secondary-100 text-secondary-600">
                              {index + 1}
                            </span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-secondary-900 truncate">
                              {member.name}
                            </span>
                            <span className={clsx('text-xs shrink-0', TIER_TEXT_CLASS[tier])}>{rate}%</span>
                          </div>
                          <div className="w-full bg-secondary-200 rounded-full h-2">
                            <div
                              className={clsx('h-2 rounded-full transition-all duration-500', TIER_BAR_CLASS[tier])}
                              style={{ width: `${Math.min(100, rate)}%` }}
                            />
                          </div>
                          <div className="flex justify-between items-center mt-1">
                            <span className="text-[10px] text-secondary-400">
                              {formatCurrency(member.achieved)} من {formatCurrency(member.target)}
                            </span>
                            {medal && (
                              <span className={clsx('text-[10px]', TIER_TEXT_CLASS[tier])}>
                                {TIER_LABEL[tier]}
                              </span>
                            )}
                          </div>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {sheetStack.length > 0 && (
        <TeamPerformanceSheet
          stack={sheetStack}
          children={getChildrenDetails(sheetStack[sheetStack.length - 1].id)}
          onSelectChild={handleSelectChild}
          onBack={handleSheetBack}
          onClose={handleSheetClose}
        />
      )}
    </>
  );
}
