import { memo } from 'react';
import { ChevronDown, ChevronUp, Users, Wallet } from 'lucide-react';
import clsx from 'clsx';
import { ROLE_LABELS } from '../../../lib/supabase';
import type { RosterUser } from '../types';
import { ROLE_STYLES } from '../constants';
import { fmt, achievementColor } from '../utils';
import { OrgAvatar } from './OrgAvatar';

// ─── عقدة فى شجرة الهيكل (تصميم شجرة مسنودة/Indented Tree) ────────────────
// كل مستوى بيتزحزح جوه شوية عن اللي فوقه، وخط رأسي واحد ("جذع") بيوصل كل
// مجموعة تابعين ببعضها تحت نفس الأب — ده اللي بيخلي "مين تابع لمين" واضح
// من أول نظرة من غير ما تفتح أي بطاقة، عكس التصميم القديم اللي كان بيحط
// التابعين فى شبكة عمودين جنب بعض من غير أي خط بصري يربطهم بالراس.
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

// حجم الكارت بيتحدد حسب الدرجة الوظيفية مش العمق فى الشجرة — كل درجة ليها
// نفس الشكل أينما ظهرت. الأفاتار بتظهر للمراقب فما فوق ورئيس المجموعة،
// وبتتخفى للوكيل/الوسيط الحر بس (اسم + نسبة) عشان يفضل الكارت مضغوط لأن
// عددهم أكبر بكتير من باقي الدرجات.
function getTier(role: RosterUser['role']): 'full' | 'compact' | 'minimal' {
  if (role === 'agent' || role === 'premium_agent') return 'minimal';
  if (role === 'group_leader') return 'compact';
  return 'full';
}

function OrgNodeImpl({
  id, depth, roster, childrenMap, expanded, production, loadingIds, highlightIds, onToggle, registerRef,
}: OrgNodeProps) {
  const node = roster.get(id);
  if (!node) return null;

  const style = ROLE_STYLES[node.role];
  const isOpen = expanded.has(id);
  const allChildIds = childrenMap.get(id) || [];
  // الوكلاء (وكيل / وسيط حر) الغير نشطين ميتعرضوش كبطاقات فى الشجرة خالص —
  // بيفضلوا محسوبين فى عدد التابعين، بس مش هيبقى ليهم كارت فى القائمة.
  const childIds = allChildIds.filter((cid) => {
    const c = roster.get(cid);
    if (!c) return true;
    const isAgentRole = c.role === 'agent' || c.role === 'premium_agent';
    return !(isAgentRole && !c.is_active);
  });
  const hasChildren = allChildIds.length > 0;
  // عدد التابعين المعروض فى الكارت لازم يبقى النشطين بس
  const activeChildCount = allChildIds.filter((cid) => roster.get(cid)?.is_active !== false).length;
  const isLoadingProd = loadingIds.has(id);
  const prodValue = production.get(id);
  const rate = node.target > 0 && prodValue !== undefined ? Math.round((prodValue / node.target) * 100) : null;
  const dimmed = highlightIds ? !highlightIds.has(id) : false;

  const tier = getTier(node.role);
  const compact = tier !== 'full';
  const minimal = tier === 'minimal';

  return (
    <div ref={(el) => registerRef(id, el)} className="min-w-0 w-full">
      <button
        type="button"
        onClick={() => hasChildren && onToggle(id)}
        className={clsx(
          'relative w-full min-w-0 text-right rounded-lg sm:rounded-xl border transition-all duration-200',
          minimal ? 'py-1 px-1.5' : compact ? 'py-1.5 px-2' : 'py-2 px-2.5',
          'sm:p-3',
          hasChildren ? 'cursor-pointer active:scale-[0.99]' : 'cursor-default',
          isOpen ? 'bg-white border-primary-200 shadow-sm' : 'bg-white border-secondary-100 hover:border-secondary-200 hover:shadow-sm',
          dimmed && 'opacity-40'
        )}
      >
        {/* شريط لوني جانبي يمثّل الدرجة الوظيفية — إشارة بصرية ثابتة ومستقلة
            عن أى تكبير/تصغير خط، بتفرّق بين المستويات فورًا حتى من بعيد */}
        <span className={clsx('absolute top-1.5 bottom-1.5 right-0 w-1 rounded-full sm:hidden', style.dot)} />
        <span className={clsx('hidden sm:block absolute top-2 bottom-2 right-0 w-1 rounded-full', style.dot)} />

        <div className="flex items-center gap-1.5 sm:gap-3 min-w-0 pr-1.5 sm:pr-2">
          {!minimal && (
            <OrgAvatar name={node.name} avatarUrl={node.avatar_url} style={style} compact={compact} />
          )}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-1 sm:gap-2 min-w-0">
              <p className={clsx(
                'font-semibold text-secondary-900 truncate',
                minimal ? 'text-[10px]' : compact ? 'text-[11px]' : 'text-[12px]',
                'sm:text-base'
              )}>
                {node.name}
              </p>
              {!node.is_active && (
                <span className="badge badge-error text-[7px] sm:text-[10px] flex-shrink-0 px-1 py-0">معطّل</span>
              )}
            </div>
            {/* بادچ الدرجة الوظيفية بيبان دايماً — فى كل المستويات من غير
                استثناء — لأن ده أهم عنصر بيوضح "مين ده فى الهرم" من أول نظرة */}
            <span
              className={clsx(
                'inline-block mt-0.5 px-1.5 py-0 rounded-full font-medium truncate max-w-full',
                minimal ? 'text-[8px]' : 'text-[9px]',
                'sm:text-[11px] sm:px-2 sm:py-0.5',
                style.bg, style.text
              )}
            >
              {ROLE_LABELS[node.role]}
            </span>
          </div>

          {/* الإنتاج + عدد التابعين + نسبة الإنجاز مجمّعين على اليسار */}
          <div className="flex flex-col items-end gap-0.5 shrink-0 text-left">
            <div className="flex items-center gap-1">
              <Wallet className={clsx(minimal ? 'w-2 h-2' : 'w-2.5 h-2.5', 'sm:w-3.5 sm:h-3.5 text-success-500')} />
              {isLoadingProd || prodValue === undefined ? (
                <div className="h-2 sm:h-3.5 w-10 sm:w-16 bg-secondary-100 rounded animate-pulse" />
              ) : (
                <p className={clsx(minimal ? 'text-[8px]' : 'text-[9px]', 'sm:text-sm font-bold text-success-700 whitespace-nowrap')}>
                  {fmt(prodValue)}
                </p>
              )}
            </div>
            {tier === 'full' && hasChildren && (
              <div className="flex items-center gap-1">
                <Users className="w-2 h-2 sm:w-3.5 sm:h-3.5 text-info-500" />
                <p className="text-[8px] sm:text-sm font-bold text-secondary-900">{activeChildCount} تابع</p>
              </div>
            )}
          </div>

          {hasChildren ? (
            <div className={clsx(
              'flex-shrink-0 rounded-full bg-secondary-50 flex items-center justify-center',
              minimal ? 'w-4 h-4' : 'w-4.5 h-4.5',
              'sm:w-7 sm:h-7'
            )}>
              {isOpen
                ? <ChevronUp className={clsx(minimal ? 'w-2.5 h-2.5' : 'w-3 h-3', 'sm:w-4 sm:h-4 text-secondary-500')} />
                : <ChevronDown className={clsx(minimal ? 'w-2.5 h-2.5' : 'w-3 h-3', 'sm:w-4 sm:h-4 text-secondary-500')} />}
            </div>
          ) : (
            <span className="w-4.5 sm:w-7 shrink-0" />
          )}
        </div>

        {node.target > 0 && (
          <div className={clsx('pr-1.5 sm:pr-2', minimal ? 'mt-1' : 'mt-1.5', 'sm:mt-2.5')}>
            <div className="flex items-center justify-between mb-0.5 min-w-0">
              {!minimal && <span className="text-[7px] sm:text-[10px] text-secondary-400">نسبة الإنجاز</span>}
              {rate !== null ? (
                <span className={clsx(minimal ? 'text-[7px]' : 'text-[8px]', 'sm:text-[11px] font-bold text-secondary-700')}>{rate}%</span>
              ) : (
                <div className="h-1.5 sm:h-2.5 w-8 bg-secondary-100 rounded animate-pulse" />
              )}
            </div>
            <div className="w-full bg-secondary-200 rounded-full h-1 sm:h-1.5">
              <div
                className={clsx(
                  'h-1 sm:h-1.5 rounded-full transition-all duration-500',
                  rate !== null ? achievementColor(rate) : 'bg-secondary-200'
                )}
                style={{ width: `${rate !== null ? Math.min(100, rate) : 0}%` }}
              />
            </div>
          </div>
        )}
      </button>

      {/* التابعون: قائمة عمود واحد بس (مش شبكة) + خط رأسي "جذع" واحد يربط
          كل التابعين ببعض تحت نفس الأب — كل مستوى أعمق بيتزحزح جوه شوية
          زيادة، فيتضح الفرق بين "مستوى 1" و"مستوى 2" ...إلخ بمجرد النظر،
          حتى لو المستخدم مفتحش أي بطاقة تانية. */}
      {hasChildren && isOpen && childIds.length > 0 && (
        <div
          className={clsx(
            'relative mt-1 sm:mt-1.5 space-y-1 sm:space-y-1.5 border-l-0',
            minimal ? 'mr-1 pr-2' : 'mr-2 pr-3',
            'sm:mr-4 sm:pr-4',
            'border-r-2 border-secondary-200'
          )}
        >
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
// تتغير كـ Set/Map جديد فى كل مرة يتفتح/يتقفل فيها أي عنصر فى الشجرة، فمقارنة
// المرجع الافتراضية كانت هتخلي كل عقدة فى الشجرة تعيد الرسم مع أي تفاعل بسيط.
// هنا بنقارن فقط الجزء الخاص بهذه العقدة تحديدًا (id) من كل مجموعة/خريطة.
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
