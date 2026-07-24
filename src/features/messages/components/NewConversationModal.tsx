import { useEffect, useMemo, useState } from 'react';
import { Search, X, Users } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import * as messagesService from '../messagesService';
import type { MessageableUser } from '../types';
import { MESSAGING_ROLE_GROUP_LABELS, MESSAGING_ROLE_GROUP_ORDER } from '../types';

interface Props {
  onClose: () => void;
  onSelectUser: (userId: string) => void | Promise<void>;
}

function lastSeenLabel(u: MessageableUser): string {
  if (u.is_online) return 'متصل الآن';
  if (!u.last_seen_at) return 'غير متصل';
  return `آخر ظهور ${formatDistanceToNow(new Date(u.last_seen_at), { locale: ar, addSuffix: true })}`;
}

export function NewConversationModal({ onClose, onSelectUser }: Props) {
  const [users, setUsers] = useState<MessageableUser[]>([]);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    messagesService.fetchMessageableUsers()
      .then((data) => { if (!cancelled) setUsers(data); })
      .catch(() => { if (!cancelled) setError('تعذّر تحميل قائمة المستخدمين'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    if (!query.trim()) return users;
    const q = query.trim().toLowerCase();
    return users.filter((u) => u.name.toLowerCase().includes(q) || MESSAGING_ROLE_GROUP_LABELS[u.role]?.toLowerCase().includes(q));
  }, [users, query]);

  // تقسيم تلقائى حسب الهيكل الوظيفى — بالترتيب المطلوب بالضبط
  const groups = useMemo(() => {
    const byRole = new Map<string, MessageableUser[]>();
    for (const u of filtered) {
      const list = byRole.get(u.role) || [];
      list.push(u);
      byRole.set(u.role, list);
    }
    return MESSAGING_ROLE_GROUP_ORDER
      .map((role) => ({ role, label: MESSAGING_ROLE_GROUP_LABELS[role], users: (byRole.get(role) || []).sort((a, b) => a.name.localeCompare(b.name, 'ar')) }))
      .filter((g) => g.users.length > 0);
  }, [filtered]);

  const handleSelect = async (userId: string) => {
    if (selecting) return;
    setSelecting(userId);
    try {
      await onSelectUser(userId);
    } finally {
      setSelecting(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[85vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-100">
          <h3 className="font-bold text-secondary-900">رسالة جديدة</h3>
          <button onClick={onClose} className="text-secondary-400 hover:text-secondary-600" aria-label="إغلاق">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="px-4 py-3 border-b border-secondary-100">
          <div className="relative">
            <Search className="w-4 h-4 text-secondary-300 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث بالاسم أو المسمى الوظيفى..."
              className="input-field !pr-9 !py-2 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 space-y-3">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 animate-pulse">
                  <div className="w-10 h-10 rounded-full bg-secondary-100 shrink-0" />
                  <div className="flex-1 space-y-1.5">
                    <div className="h-3 w-1/3 bg-secondary-100 rounded" />
                    <div className="h-2.5 w-1/4 bg-secondary-100 rounded" />
                  </div>
                </div>
              ))}
            </div>
          ) : error ? (
            <div className="text-center text-error-600 text-sm py-8">{error}</div>
          ) : groups.length === 0 ? (
            <div className="flex flex-col items-center justify-center text-secondary-400 text-sm py-10 gap-2">
              <Users className="w-10 h-10 text-secondary-200" />
              <span>{query.trim() ? 'لا يوجد مستخدمون مطابقون' : 'لا يوجد مستخدمون يمكنك مراسلتهم حالياً'}</span>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.role}>
                <div className="sticky top-0 bg-secondary-50 text-secondary-500 text-xs font-semibold px-4 py-1.5 border-y border-secondary-100">
                  {group.label}
                </div>
                {group.users.map((u) => (
                  <button
                    key={u.id}
                    onClick={() => handleSelect(u.id)}
                    disabled={selecting === u.id}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary-50 text-right disabled:opacity-60"
                  >
                    <div className="relative shrink-0">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt="" className="w-10 h-10 rounded-full object-cover" />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-semibold">
                          {u.name.charAt(0)}
                        </div>
                      )}
                      {u.is_online && (
                        <span className="absolute bottom-0 left-0 w-3 h-3 rounded-full bg-success-500 border-2 border-white" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-medium text-secondary-900 truncate">{u.name}</div>
                      <div className="text-xs text-secondary-400 truncate">{MESSAGING_ROLE_GROUP_LABELS[u.role]}</div>
                    </div>
                    <div className={`text-[11px] shrink-0 ${u.is_online ? 'text-success-600' : 'text-secondary-300'}`}>
                      {lastSeenLabel(u)}
                    </div>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
