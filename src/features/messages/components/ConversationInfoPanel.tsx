import { useState } from 'react';
import { X, Pin, PinOff, BellOff, Bell, Archive, ArchiveRestore, Trash2, Search, Info } from 'lucide-react';
import * as messagesService from '../messagesService';
import type { ConversationListItem, SearchMessageResult } from '../types';
import { useMessageToast } from './MessageToast';

interface Props {
  item: ConversationListItem;
  onClose: () => void;
  onChanged: () => void;
}

export function ConversationInfoPanel({ item, onClose, onChanged }: Props) {
  const { conversation, member } = item;
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchMessageResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const { showSuccess, showError } = useMessageToast();

  const runAction = async (action: () => Promise<void>, successMsg: string) => {
    setBusy(true);
    try {
      await action();
      showSuccess(successMsg);
      onChanged();
    } catch {
      showError('حدث خطأ، حاول مرة أخرى');
    } finally {
      setBusy(false);
    }
  };

  const handleSearch = async (q: string) => {
    setSearchQuery(q);
    if (!q.trim()) { setSearchResults([]); return; }
    setSearching(true);
    try {
      const results = await messagesService.searchMessages(q, conversation.id);
      setSearchResults(results);
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white border-r border-secondary-100 w-full md:w-80 shrink-0">
      <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-100">
        <h3 className="font-bold text-secondary-900">معلومات المحادثة</h3>
        <button onClick={onClose} className="text-secondary-400 hover:text-secondary-600" aria-label="إغلاق">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-5">
        <div className="grid grid-cols-2 gap-2">
          <button
            disabled={busy}
            onClick={() => runAction(() => messagesService.togglePinConversation(conversation.id, !member.is_pinned), member.is_pinned ? 'تم إلغاء التثبيت' : 'تم التثبيت')}
            className="flex items-center gap-2 justify-center btn btn-sm btn-secondary"
          >
            {member.is_pinned ? <PinOff className="w-4 h-4" /> : <Pin className="w-4 h-4" />}
            {member.is_pinned ? 'إلغاء التثبيت' : 'تثبيت'}
          </button>
          <button
            disabled={busy}
            onClick={() => runAction(() => messagesService.toggleMuteConversation(conversation.id, !member.is_muted), member.is_muted ? 'تم تفعيل الإشعارات' : 'تم كتم الإشعارات')}
            className="flex items-center gap-2 justify-center btn btn-sm btn-secondary"
          >
            {member.is_muted ? <Bell className="w-4 h-4" /> : <BellOff className="w-4 h-4" />}
            {member.is_muted ? 'تفعيل الإشعارات' : 'كتم الإشعارات'}
          </button>
          <button
            disabled={busy}
            onClick={() => runAction(() => messagesService.toggleArchiveConversation(conversation.id, !member.is_archived), member.is_archived ? 'تمت الاستعادة' : 'تمت الأرشفة')}
            className="flex items-center gap-2 justify-center btn btn-sm btn-secondary"
          >
            {member.is_archived ? <ArchiveRestore className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
            {member.is_archived ? 'استعادة' : 'أرشفة'}
          </button>
          <button
            disabled={busy}
            onClick={() => runAction(async () => { await messagesService.hideConversationForSelf(conversation.id); onClose(); }, 'تم حذف المحادثة من قائمتك')}
            className="flex items-center gap-2 justify-center btn btn-sm btn-secondary !text-error-600"
          >
            <Trash2 className="w-4 h-4" /> حذف من القائمة
          </button>
        </div>

        <div>
          <label className="text-sm font-medium text-secondary-600 mb-1.5 flex items-center gap-1.5">
            <Search className="w-4 h-4" /> بحث داخل المحادثة
          </label>
          <input
            value={searchQuery}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="اكتب كلمة للبحث..."
            className="input-field text-sm"
          />
          {searching && <div className="text-xs text-secondary-400 mt-2">جارِ البحث...</div>}
          {searchResults.length > 0 && (
            <div className="mt-2 space-y-2 max-h-52 overflow-y-auto">
              {searchResults.map((r) => (
                <div key={r.message_id} className="text-sm bg-secondary-50 rounded-lg px-3 py-2">
                  <div className="text-xs text-primary-600 font-medium">{r.sender_name}</div>
                  <div className="text-secondary-700 truncate">{r.content}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex items-start gap-2 bg-secondary-50 rounded-lg px-3 py-2.5 text-xs text-secondary-500">
          <Info className="w-4 h-4 shrink-0 mt-0.5" />
          <span>يتم الاحتفاظ بالرسائل لمدة 90 يوماً ثم تُحذف تلقائياً.</span>
        </div>
      </div>
    </div>
  );
}
