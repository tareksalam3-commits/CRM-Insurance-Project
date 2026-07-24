import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ar } from 'date-fns/locale';
import { Copy, CornerUpLeft, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import clsx from 'clsx';
import type { TeamRoomMessageWithMeta } from '../types';
import { ROLE_LABELS } from '../../../lib/supabase';
import * as teamRoomService from '../teamRoomService';

interface Props {
  message: TeamRoomMessageWithMeta;
  isOwn: boolean;
  showSenderName: boolean;
  canDeleteAny: boolean; // Super Admin يمكنه حذف أي رسالة
  onReply: (message: TeamRoomMessageWithMeta) => void;
  onChanged: () => void;
}

const EDIT_WINDOW_MS = 15 * 60 * 1000;

export function TeamRoomMessageBubble({ message, isOwn, showSenderName, canDeleteAny, onReply, onChanged }: Props) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(message.content);
  const [busy, setBusy] = useState(false);

  const ageMs = Date.now() - new Date(message.created_at).getTime();
  const canEdit = isOwn && !message.is_deleted && ageMs < EDIT_WINDOW_MS;
  const canDelete = (isOwn || canDeleteAny) && !message.is_deleted;

  const timeLabel = useMemo(() => format(new Date(message.created_at), 'h:mm a', { locale: ar }), [message.created_at]);

  const handleCopy = () => {
    navigator.clipboard.writeText(message.content);
    setMenuOpen(false);
  };

  const handleSaveEdit = async () => {
    if (!editValue.trim() || editValue === message.content) { setEditing(false); return; }
    setBusy(true);
    try {
      await teamRoomService.editTeamRoomMessage(message.id, editValue.trim());
      setEditing(false);
      onChanged();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async () => {
    setBusy(true);
    try { await teamRoomService.deleteTeamRoomMessage(message.id); onChanged(); }
    finally { setBusy(false); setMenuOpen(false); }
  };

  if (message.is_deleted) {
    return (
      <div className={clsx('flex mb-2', isOwn ? 'justify-start' : 'justify-end')}>
        <div className="max-w-[75%] px-4 py-2 rounded-2xl bg-secondary-50 text-secondary-400 text-sm italic">
          تم حذف هذه الرسالة
        </div>
      </div>
    );
  }

  return (
    <div className={clsx('flex mb-2 group', isOwn ? 'justify-start' : 'justify-end')}>
      <div className="max-w-[75%] relative">
        {message.reply_to && (
          <div className={clsx(
            'text-xs px-3 py-1.5 rounded-t-xl border-r-2 mb-[-2px] bg-secondary-50 text-secondary-500 truncate',
            isOwn ? 'border-primary-400' : 'border-secondary-300'
          )}>
            {message.reply_to.content.slice(0, 80)}
          </div>
        )}

        <div
          className={clsx(
            'px-4 py-2 rounded-2xl relative',
            isOwn ? 'bg-primary-600 text-white rounded-bl-sm' : 'bg-secondary-100 text-secondary-900 rounded-br-sm'
          )}
        >
          {showSenderName && !isOwn && (
            <div className="text-xs font-semibold text-primary-600 mb-0.5 flex items-center gap-1.5">
              <span>{message.sender_name || 'مستخدم'}</span>
              {message.sender_role && <span className="text-secondary-400 font-normal">· {ROLE_LABELS[message.sender_role]}</span>}
            </div>
          )}

          {editing ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                rows={2}
                className="input-field text-secondary-900 text-sm"
              />
              <div className="flex gap-2 justify-end">
                <button className="btn btn-sm btn-ghost" onClick={() => setEditing(false)}>إلغاء</button>
                <button className="btn btn-sm btn-primary" disabled={busy} onClick={handleSaveEdit}>حفظ</button>
              </div>
            </div>
          ) : (
            <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.content}</p>
          )}

          {!editing && (
            <div className={clsx('flex items-center gap-1 mt-1 text-[11px]', isOwn ? 'text-primary-100 justify-start' : 'text-secondary-400 justify-end')}>
              {message.is_edited && <span>معدّلة</span>}
              <span>{timeLabel}</span>
            </div>
          )}
        </div>

        {/* قائمة الإجراءات */}
        <div className={clsx(
          'absolute top-0 opacity-0 group-hover:opacity-100 transition-opacity',
          isOwn ? '-left-9' : '-right-9'
        )}>
          <button
            className="w-7 h-7 flex items-center justify-center rounded-full hover:bg-secondary-100 text-secondary-400"
            onClick={() => setMenuOpen((v) => !v)}
            aria-label="خيارات الرسالة"
          >
            <MoreVertical className="w-4 h-4" />
          </button>

          {menuOpen && (
            <div className={clsx(
              'absolute top-8 z-20 w-44 bg-white rounded-xl shadow-lg border border-secondary-100 py-1',
              isOwn ? 'right-0' : 'left-0'
            )}>
              <button className="w-full text-right px-3 py-2 text-sm hover:bg-secondary-50 flex items-center gap-2" onClick={() => { onReply(message); setMenuOpen(false); }}>
                <CornerUpLeft className="w-4 h-4" /> رد
              </button>
              <button className="w-full text-right px-3 py-2 text-sm hover:bg-secondary-50 flex items-center gap-2" onClick={handleCopy}>
                <Copy className="w-4 h-4" /> نسخ
              </button>
              {canEdit && (
                <button className="w-full text-right px-3 py-2 text-sm hover:bg-secondary-50 flex items-center gap-2" onClick={() => { setEditing(true); setMenuOpen(false); }}>
                  <Pencil className="w-4 h-4" /> تعديل
                </button>
              )}
              {canDelete && (
                <>
                  <div className="border-t border-secondary-100 my-1" />
                  <button className="w-full text-right px-3 py-2 text-sm hover:bg-error-50 text-error-600 flex items-center gap-2" onClick={handleDelete}>
                    <Trash2 className="w-4 h-4" /> حذف
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
