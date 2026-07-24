import clsx from 'clsx';
import { Users, Wallet } from 'lucide-react';
import { ROLE_LABELS } from '../../../lib/supabase';
import type { RosterUser } from '../types';
import { ROLE_STYLES } from '../constants';
import { fmt, achievementColor } from '../utils';
import { OrgAvatar } from './OrgAvatar';

// ─── بطاقة "أنت واقف فى صفحة مين دلوقتي" ──────────────────
// بتفصل بصريًا بين "الشخص اللي فريقه ظاهر تحت" وبين قائمة التابعين نفسها،
// عشان مفيش لبس بين "مين الأب" و"مين الأبناء" زي ما كان بيحصل فى التصميم
// القديم لما كل حاجة مرصوصة بنفس الشكل.
export function OrgCurrentCard({
  node,
  directChildrenCount,
  production,
  isLoadingProd,
}: {
  node: RosterUser;
  directChildrenCount: number;
  production: number | undefined;
  isLoadingProd: boolean;
}) {
  const style = ROLE_STYLES[node.role];
  const rate = node.target > 0 && production !== undefined ? Math.round((production / node.target) * 100) : null;

  return (
    <div className="card !p-3 sm:!p-4 border-2 border-primary-100 bg-primary-50/30">
      <div className="flex items-center gap-3">
        <OrgAvatar name={node.name} avatarUrl={node.avatar_url} style={style} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 min-w-0">
            <p className="font-bold text-secondary-900 text-base sm:text-lg truncate">{node.name}</p>
            {!node.is_active && <span className="badge badge-error text-[10px] flex-shrink-0">معطّل</span>}
          </div>
          <span className={clsx('inline-block mt-1 px-2 py-0.5 rounded-full text-[11px] sm:text-xs font-medium', style.bg, style.text)}>
            {ROLE_LABELS[node.role]}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-4 mt-3 pt-3 border-t border-primary-100">
        <div className="flex items-center gap-1.5">
          <Wallet className="w-4 h-4 text-success-500" />
          {isLoadingProd || production === undefined ? (
            <div className="h-4 w-16 bg-secondary-100 rounded animate-pulse" />
          ) : (
            <p className="text-sm font-bold text-success-700">{fmt(production)}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          <Users className="w-4 h-4 text-info-500" />
          <p className="text-sm font-bold text-secondary-900">{directChildrenCount} تابع مباشر</p>
        </div>
      </div>

      {node.target > 0 && (
        <div className="mt-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[11px] text-secondary-400">نسبة الإنجاز</span>
            {rate !== null ? (
              <span className="text-xs font-bold text-secondary-700">{rate}%</span>
            ) : (
              <div className="h-2.5 w-10 bg-secondary-100 rounded animate-pulse" />
            )}
          </div>
          <div className="w-full bg-secondary-200 rounded-full h-1.5">
            <div
              className={clsx('h-1.5 rounded-full transition-all duration-500', rate !== null ? achievementColor(rate) : 'bg-secondary-200')}
              style={{ width: `${rate !== null ? Math.min(100, rate) : 0}%` }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
