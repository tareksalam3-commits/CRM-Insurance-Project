import { useMemo, useState } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Archive, ArchiveRestore, BellOff, MoreVertical, Pin, PinOff, Plus, Search, Trash2, Users, Users2 } from 'lucide-react';
import clsx from 'clsx';
import type { ConversationListItem } from '../types';
import { ROLE_LABELS } from '../../../lib/supabase';
import * as messagesService from '../messagesService';
import { useMessageToast } from './MessageToast';

interface Props {
  items: ConversationListItem[];
  activeConversationId: string | null;
  onSelect: (item: ConversationListItem) => void;
  onNewConversation: () => void;
  onChanged: () => void;
  /** إظهار عنصر "غرفة الفريق" المثبّت أعلى القائمة */
  showTeamRoom: boolean;
  isTeamRoomActive: boolean;
  onSelectTeamRoom: () => void;
}

export function ConversationList({
  items, activeConversationId, onSelect, onNewConversation, onChanged,
  showTeamRoom, isTeamRoomActive, onSelectTeamRoom,
}: Props) {
  const [query, setQuery] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const { showSuccess, showError } = useMessageToast();

  const visible = useMemo(
    () => items.filter((it) => (showArchived ? it.member.is_archived : !it.member.is_archived)),
    [items, showArchived]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return visible;
    const q = query.trim().toLowerCase();
    return visible.filter((it) => (it.otherUser?.name || '').toLowerCase().includes(q));
  }, [visible, query]);

  const archivedCount = useMemo(() => items.filter((it) => it.member.is_archived).length, [items]);

  const runAction = async (id: string, action: () => Promise<void>, successMsg: string) => {
    setBusyId(id);
    setOpenMenuId(null);
    try {
      await action();
      showSuccess(successMsg);
      onChanged();
    } catch {
      showError('حدث خطأ، حاول مرة أخرى');
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="flex flex-col h-full border-l border-secondary-100 bg-white relative">
      <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-100">
        <h2 className="font-bold text-lg text-secondary-900">الرسائل</h2>
        <button
          onClick={onNewConversation}
          className="btn btn-primary flex items-center gap-1.5 !px-3.5 !py-2 text-sm"
          aria-label="إرسال رسالة"
        >
          <Plus className="w-5 h-5" />
          <span>إرسال رسالة</span>
        </button>
      </div>

      <div className="px-3 py-2 border-b border-secondary-100">
        <div className="relative">
          <Search className="w-4 h-4 text-secondary-300 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="بحث فى المحادثات..."
            className="input-field !pr-9 !py-2 text-sm"
          />
        </div>
      </div>

      {showTeamRoom && (
        <button
          onClick={onSelectTeamRoom}
          className={clsx(
            'w-full flex items-center gap-3 px-4 py-3 border-b border-secondary-100 text-right transition-colors',
            isTeamRoomActive ? 'bg-primary-50' : 'hover:bg-secondary-50'
          )}
        >
          <div className="w-11 h-11 rounded-full flex items-center justify-center bg-info-100 text-info-700 shrink-0">
            <Users2 className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0 text-right">
            <div className="font-medium text-secondary-900 truncate">غرفة الفريق</div>
            <div className="text-sm text-secondary-500 truncate">الغرفة الجماعية للفريق</div>
          </div>
        </button>
      )}

      {archivedCount > 0 && (
        <div className="px-3 py-1.5 border-b border-secondary-100">
          <button
            onClick={() => setShowArchived((v) => !v)}
            className={clsx(
              'w-full flex items-center justify-center gap-1.5 text-xs py-1.5 rounded-lg',
              showArchived ? 'bg-primary-50 text-primary-700' : 'text-secondary-400 hover:bg-secondary-50'
            )}
          >
            <Archive className="w-3.5 h-3.5" />
            {showArchived ? 'عرض المحادثات العادية' : `المحادثات المؤرشفة (${archivedCount})`}
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center text-secondary-400 text-sm py-10 gap-2">
            <Users className="w-10 h-10 text-secondary-200" />
            <span>{showArchived ? 'لا توجد محادثات مؤرشفة' : 'لا توجد محادثات'}</span>
            {!showArchived && !query.trim() && (
              <button onClick={onNewConversation} className="btn btn-sm btn-primary mt-1">ابدأ محادثة جديدة</button>
            )}
          </div>
        ) : (
          filtered.map((item) => {
            const title = item.otherUser?.name || 'مستخدم';
            const subtitle = item.otherUser ? ROLE_LABELS[item.otherUser.role] : '';
            const isActive = item.conversation.id === activeConversationId;
            const id = item.conversation.id;
            const busy = busyId === id;
            return (
              <div
                key={id}
                className={clsx(
                  'group relative flex items-center gap-3 px-4 py-3 border-b border-secondary-50 transition-colors',
                  isActive ? 'bg-primary-50' : 'hover:bg-secondary-50'
                )}
              >
                <button onClick={() => onSelect(item)} className="flex items-center gap-3 flex-1 min-w-0 text-right">
                  <div className="relative shrink-0">
                    <div className="w-11 h-11 rounded-full flex items-center justify-center font-semibold bg-primary-100 text-primary-700">
                      {title.charAt(0)}
                    </div>
                    {item.otherUser?.is_online && (
                      <span className="absolute bottom-0 left-0 w-3 h-3 rounded-full bg-success-500 border-2 border-white" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium text-secondary-900 truncate flex items-center gap-1">
                        {item.member.is_pinned && <Pin className="w-3 h-3 text-secondary-400 shrink-0" />}
                        {item.member.is_muted && <BellOff className="w-3 h-3 text-secondary-300 shrink-0" />}
                        {title}
                      </span>
                      {item.conversation.last_message_at && (
                        <span className="text-[11px] text-secondary-400 shrink-0">
                          {formatDistanceToNow(new Date(item.conversation.last_message_at), { locale: ar, addSuffix: true })}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-0.5">
                      <span className="text-sm text-secondary-500 truncate">
                        {item.conversation.last_message_preview || subtitle || 'لا توجد رسائل بعد'}
                      </span>
                      {item.unreadCount > 0 && (
                        <span className="badge badge-primary shrink-0">{item.unreadCount}</span>
                      )}
                    </div>
                  </div>
                </button>

                <div className="relative shrink-0">
                  <button
                    onClick={() => setOpenMenuId((v) => (v === id ? null : id))}
                    className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-secondary-100 text-secondary-400 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                    aria-label="خيارات المحادثة"
                    disabled={busy}
                  >
                    <MoreVertical className="w-4 h-4" />
                  </button>

                  {openMenuId === id && (
                    <div className="absolute left-0 top-8 z-20 w-48 bg-white rounded-xl shadow-lg border border-secondary-100 py-1">
                      <button
                        className="w-full text-right px-3 py-2 text-sm hover:bg-secondary-50 flex items-center gap-2"
                        onClick={() => runAction(id, () => messagesService.togglePinConversation(id, !item.member.is_pinned), item.member.is_pinned ? 'تم إلغاء التثبيت' : 'تم التثبيت')}
                      >
                        {item.member.is_pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
                        {item.member.is_pinned ? 'إلغاء التثبيت' : 'تثبيت المحادثة'}
                      </button>
                      <button
                        className="w-full text-right px-3 py-2 text-sm hover:bg-secondary-50 flex items-center gap-2"
                        onClick={() => runAction(id, () => messagesService.toggleMuteConversation(id, !item.member.is_muted), item.member.is_muted ? 'تم تفعيل الإشعارات' : 'تم كتم الإشعارات')}
                      >
                        <BellOff className="w-4 h-4" />
                        {item.member.is_muted ? 'تفعيل الإشعارات' : 'كتم الإشعارات'}
                      </button>
                      <button
                        className="w-full text-right px-3 py-2 text-sm hover:bg-secondary-50 flex items-center gap-2"
                        onClick={() => runAction(id, () => messagesService.toggleArchiveConversation(id, !item.member.is_archived), item.member.is_archived ? 'تمت الاستعادة من الأرشيف' : 'تمت أرشفة المحادثة')}
                      >
                        {item.member.is_archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
                        {item.member.is_archived ? 'استعادة من الأرشيف' : 'أرشفة المحادثة'}
                      </button>
                      <div className="border-t border-secondary-100 my-1" />
                      <button
                        className="w-full text-right px-3 py-2 text-sm hover:bg-error-50 text-error-600 flex items-center gap-2"
                        onClick={() => runAction(id, () => messagesService.hideConversationForSelf(id), 'تم حذف المحادثة من قائمتك')}
                      >
                        <Trash2 className="w-4 h-4" /> حذف من القائمة
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
