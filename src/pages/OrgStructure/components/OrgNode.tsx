import { memo } from 'react';
import { ChevronDown, ChevronUp, Users, Wallet } from 'lucide-react';
import clsx from 'clsx';
import { ROLE_LABELS } from '../../../lib/supabase';
import type { RosterUser } from '../types';
import { ROLE_STYLES } from '../constants';
import { fmt, achievementColor } from '../utils';
import { OrgAvatar } from './OrgAvatar';

// ─── Expandable card (Accordion) ──────────────────────────
// بطاقة قابلة للفتح/الإغلاق: بتعرض بيانات المستخدم، وعند الفتح بترسم بطاقات
// التابعين المباشرين بس (مش الشجرة كلها) — التابعون الأعمق ميترسموش في الـ DOM
// أصلاً غير لما بطاقتهم هما نفسهم تتفتح.
interface OrgNodeProps {
  id: string;
  depth: number;
  roster: Map<string, RosterUser>;
  childrenMap: Map<string, string[]>;
  expanded: Set<string>;
  production: Map<string, number>;
  loadingIds: Set<string>;
  highlightIds: Set<string> | null;
  onToggle: (id: string) => void;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
}

function OrgNodeImpl({
  id, depth, roster, childrenMap, expanded, production, loadingIds, highlightIds, onToggle, registerRef,
}: OrgNodeProps) {
  const node = roster.get(id);
  if (!node) return null;

  const style = ROLE_STYLES[node.role];
  const isOpen = expanded.has(id);
  const childIds = childrenMap.get(id) || [];
  const hasChildren = childIds.length > 0;
  const isLoadingProd = loadingIds.has(id);
  const prodValue = production.get(id);
  const rate = node.target > 0 && prodValue !== undefined ? Math.round((prodValue / node.target) * 100) : null;
  const dimmed = highlightIds ? !highlightIds.has(id) : false;

  return (
    <div ref={(el) => registerRef(id, el)} className={clsx(depth > 0 && 'mt-2')}>
      <button
        onClick={() => hasChildren && onToggle(id)}
        className={clsx(
          'w-full text-right p-3.5 sm:p-4 rounded-2xl border transition-all duration-200',
          hasChildren ? 'cursor-pointer active:scale-[0.99]' : 'cursor-default',
          isOpen ? 'bg-white border-primary-200 shadow-sm' : 'bg-white border-secondary-100 hover:border-secondary-200 hover:shadow-sm',
          dimmed && 'opacity-40'
        )}
      >
        <div className="flex items-center gap-3">
          <OrgAvatar name={node.name} avatarUrl={node.avatar_url} style={style} />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <p className="font-semibold text-secondary-900 truncate">{node.name}</p>
              {!node.is_active && (
                <span className="badge badge-error text-[10px] flex-shrink-0">معطّل</span>
              )}
            </div>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className={clsx('w-1.5 h-1.5 rounded-full flex-shrink-0', style.dot)} />
              <span className="text-xs text-secondary-500">{ROLE_LABELS[node.role]}</span>
            </div>
          </div>
          {hasChildren && (
            <div className="flex-shrink-0 w-7 h-7 rounded-full bg-secondary-50 flex items-center justify-center">
              {isOpen
                ? <ChevronUp className="w-4 h-4 text-secondary-500" />
                : <ChevronDown className="w-4 h-4 text-secondary-500" />}
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2 mt-3.5 pt-3.5 border-t border-secondary-100">
          <div className="flex items-center gap-1.5 min-w-0">
            <Wallet className="w-3.5 h-3.5 text-success-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-secondary-400 leading-none mb-1">الإنتاج الحالي</p>
              {isLoadingProd || prodValue === undefined ? (
                <div className="h-3.5 w-16 bg-secondary-100 rounded animate-pulse" />
              ) : (
                <p className="text-xs sm:text-sm font-bold text-success-700 truncate">{fmt(prodValue)}</p>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1.5 min-w-0">
            <Users className="w-3.5 h-3.5 text-info-500 flex-shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] text-secondary-400 leading-none mb-1">التابعون المباشرون</p>
              <p className="text-xs sm:text-sm font-bold text-secondary-900">{childIds.length}</p>
            </div>
          </div>
        </div>

        {node.target > 0 && (
          <div className="mt-3.5">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[10px] text-secondary-400">نسبة الإنجاز</span>
              {rate !== null ? (
                <span className="text-[11px] font-bold text-secondary-700">{rate}%</span>
              ) : (
                <div className="h-2.5 w-8 bg-secondary-100 rounded animate-pulse" />
              )}
            </div>
            <div className="w-full bg-secondary-200 rounded-full h-1.5">
              <div
                className={clsx(
                  'h-1.5 rounded-full transition-all duration-500',
                  rate !== null ? achievementColor(rate) : 'bg-secondary-200'
                )}
                style={{ width: `${rate !== null ? Math.min(100, rate) : 0}%` }}
              />
            </div>
          </div>
        )}
      </button>

      {hasChildren && isOpen && (
        <div className="mr-2 sm:mr-3 pr-3 sm:pr-4 mt-2 py-2.5 px-1 bg-secondary-50/60 rounded-2xl space-y-2">
          {childIds.map((childId) => (
            <OrgNode
              key={childId}
              id={childId}
              depth={depth + 1}
              roster={roster}
              childrenMap={childrenMap}
              expanded={expanded}
              production={production}
              loadingIds={loadingIds}
              highlightIds={highlightIds}
              onToggle={onToggle}
              registerRef={registerRef}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// React.memo بمقارنة مخصّصة: expanded/production/loadingIds/highlightIds كلها
// تتغير كـ Set/Map جديد فى كل مرة يتفتح/يتقفل فيها أي عنصر فى الشجرة (تحديث
// غير قابل للتغيير Immutable Update)، فمقارنة المرجع الافتراضية كانت هتخلي
// كل عقدة فى الشجرة تعيد الرسم مع أي تفاعل بسيط. هنا بنقارن فقط الجزء
// الخاص بهذه العقدة تحديدًا (id) من كل مجموعة/خريطة، فمفيش إعادة رسم إلا
// للعقد اللي فعلاً تغيّرت حالتها أو بياناتها.
function orgNodePropsAreEqual(prev: OrgNodeProps, next: OrgNodeProps): boolean {
  return (
    prev.id === next.id &&
    prev.depth === next.depth &&
    prev.roster === next.roster &&
    prev.childrenMap === next.childrenMap &&
    prev.onToggle === next.onToggle &&
    prev.registerRef === next.registerRef &&
    prev.expanded.has(prev.id) === next.expanded.has(next.id) &&
    prev.production.get(prev.id) === next.production.get(next.id) &&
    prev.loadingIds.has(prev.id) === next.loadingIds.has(next.id) &&
    (prev.highlightIds ? prev.highlightIds.has(prev.id) : false) ===
      (next.highlightIds ? next.highlightIds.has(next.id) : false)
  );
}

export const OrgNode = memo(OrgNodeImpl, orgNodePropsAreEqual);
