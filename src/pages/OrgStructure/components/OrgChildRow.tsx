import { ChevronLeft } from 'lucide-react';
import clsx from 'clsx';
import { ROLE_LABELS } from '../../../lib/supabase';
import type { RosterUser } from '../types';
import { ROLE_STYLES } from '../constants';
import { fmt, achievementColor } from '../utils';
import { OrgAvatar } from './OrgAvatar';

// ─── صف تابع مباشر واحد ──────────────────────────────────
// كل التابعين المباشرين لنفس المدير بيظهروا كقائمة مستوى واحد بس، فمفيش
// تداخل بصري بين مستويات مختلفة. لو للشخص ده تابعين هو نفسه، الضغط على
// صفه بيدخلك لصفحته هو (زر التوسيع الحقيقي: يدخل جوه الفرع مش يفرده هنا).
export function OrgChildRow({
  node,
  hasChildren,
  childCount,
  production,
  isLoadingProd,
  onOpen,
}: {
  node: RosterUser;
  hasChildren: boolean;
  childCount: number;
  production: number | undefined;
  isLoadingProd: boolean;
  onOpen: () => void;
}) {
  const style = ROLE_STYLES[node.role];
  const rate = node.target > 0 && production !== undefined ? Math.round((production / node.target) * 100) : null;

  return (
    <button
      type="button"
      onClick={() => hasChildren && onOpen()}
      className={clsx(
        'relative w-full text-right rounded-xl border bg-white p-2.5 sm:p-3 transition-all duration-150',
        hasChildren ? 'cursor-pointer active:scale-[0.99] hover:border-secondary-200 hover:shadow-sm' : 'cursor-default',
        'border-secondary-100'
      )}
    >
      <span className={clsx('absolute top-2 bottom-2 right-0 w-1 rounded-full', style.dot)} />
      <div className="flex items-center gap-2.5 pr-2">
        <OrgAvatar name={node.name} avatarUrl={node.avatar_url} style={style} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="font-semibold text-secondary-900 text-sm truncate">{node.name}</p>
            {!node.is_active && <span className="badge badge-error text-[9px] flex-shrink-0 px-1 py-0">معطّل</span>}
          </div>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            <span className={clsx('px-1.5 py-0 rounded-full text-[10px] font-medium', style.bg, style.text)}>
              {ROLE_LABELS[node.role]}
            </span>
            {hasChildren && (
              <span className="text-[10px] text-secondary-500">{childCount} تابع</span>
            )}
          </div>
        </div>

        <div className="flex flex-col items-end gap-0.5 shrink-0">
          {isLoadingProd || production === undefined ? (
            <div className="h-3 w-14 bg-secondary-100 rounded animate-pulse" />
          ) : (
            <p className="text-[11px] font-bold text-success-700 whitespace-nowrap">{fmt(production)}</p>
          )}
          {rate !== null && (
            <span className="text-[10px] font-bold text-secondary-500">{rate}%</span>
          )}
        </div>

        {hasChildren ? (
          <ChevronLeft className="w-4 h-4 text-secondary-400 shrink-0" />
        ) : (
          <span className="w-4 shrink-0" />
        )}
      </div>

      {node.target > 0 && (
        <div className="w-full bg-secondary-200 rounded-full h-1 mt-2">
          <div
            className={clsx('h-1 rounded-full transition-all duration-500', rate !== null ? achievementColor(rate) : 'bg-secondary-200')}
            style={{ width: `${rate !== null ? Math.min(100, rate) : 0}%` }}
          />
        </div>
      )}
    </button>
  );
}
