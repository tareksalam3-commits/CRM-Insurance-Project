import clsx from 'clsx';
import { ROLE_LABELS } from '../../../lib/supabase';
import type { RosterUser } from '../types';
import { ROLE_STYLES } from '../constants';
import { OrgAvatar } from './OrgAvatar';

// ─── نتائج البحث/الفلترة ─────────────────────────────────
// قائمة مسطحة بكل التطابقات فى النطاق كله (مش بس المستوى الحالي) — الضغط
// على أي نتيجة بيوديك لصفحتها هى مباشرة (شايف مديرها فى شريط المسار فوق).
export function OrgSearchResults({
  matches,
  roster,
  onSelect,
}: {
  matches: RosterUser[];
  roster: Map<string, RosterUser>;
  onSelect: (user: RosterUser) => void;
}) {
  if (matches.length === 0) {
    return (
      <div className="card text-center py-8">
        <p className="text-secondary-500 text-sm">لا توجد نتائج مطابقة</p>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <p className="text-xs text-secondary-500 px-1">{matches.length} نتيجة</p>
      {matches.map((m) => {
        const style = ROLE_STYLES[m.role];
        const manager = m.manager_id ? roster.get(m.manager_id) : undefined;
        return (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelect(m)}
            className="relative w-full text-right rounded-xl border border-secondary-100 bg-white p-2.5 sm:p-3 active:scale-[0.99] transition-all"
          >
            <span className={clsx('absolute top-2 bottom-2 right-0 w-1 rounded-full', style.dot)} />
            <div className="flex items-center gap-2.5 pr-2">
              <OrgAvatar name={m.name} avatarUrl={m.avatar_url} style={style} />
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-secondary-900 text-sm truncate">{m.name}</p>
                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                  <span className={clsx('px-1.5 py-0 rounded-full text-[10px] font-medium', style.bg, style.text)}>
                    {ROLE_LABELS[m.role]}
                  </span>
                  {manager && (
                    <span className="text-[10px] text-secondary-400">تابع لـ {manager.name}</span>
                  )}
                </div>
              </div>
            </div>
          </button>
        );
      })}
    </div>
  );
}
