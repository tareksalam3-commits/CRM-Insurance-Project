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
                    return (
                      <button
                        key={member.id}
                        type="button"
                        onClick={() => openTeamMemberSheet(member.id)}
                        className="w-full flex items-center gap-3 text-right pressable rounded-lg -mx-1 px-1 py-0.5 hover:bg-secondary-50 transition-colors"
                      >
                        <div className="w-8 text-center">
                          <span className={clsx(
                            'inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold',
                            index === 0 ? 'bg-warning-100 text-warning-700' :
                            index === 1 ? 'bg-secondary-200 text-secondary-700' :
                            'bg-secondary-100 text-secondary-600'
                          )}>
                            {index + 1}
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-sm font-medium text-secondary-900 truncate">
                              {member.name}
                            </span>
                            <span className="text-xs text-secondary-500">{rate}%</span>
                          </div>
                          <div className="w-full bg-secondary-200 rounded-full h-2">
                            <div
                              className={clsx(
                                'h-2 rounded-full transition-all duration-500',
                                rate >= 100 ? 'bg-success-500' :
                                rate >= 70 ? 'bg-warning-500' : 'bg-error-500'
                              )}
                              style={{ width: `${Math.min(100, rate)}%` }}
                            />
                          </div>
                          <div className="flex justify-between mt-1">
                            <span className="text-[10px] text-secondary-400">
                              {formatCurrency(member.achieved)}
                            </span>
                            <span className="text-[10px] text-secondary-400">
                              من {formatCurrency(member.target)}
                            </span>
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
