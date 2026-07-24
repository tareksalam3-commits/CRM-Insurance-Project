import { useState } from 'react';
import { X, Forward } from 'lucide-react';
import * as messagesService from '../messagesService';
import type { ConversationListItem, MessageWithMeta } from '../types';

interface Props {
  message: MessageWithMeta;
  conversations: ConversationListItem[];
  onClose: () => void;
  onForwarded: () => void;
}

export function ForwardMessageModal({ message, conversations, onClose, onForwarded }: Props) {
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleForward = async (conversationId: string) => {
    setBusyId(conversationId);
    try {
      await messagesService.forwardMessage(message.id, conversationId);
      onForwarded();
      onClose();
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-md max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-100">
          <h3 className="font-bold text-secondary-900 flex items-center gap-2">
            <Forward className="w-4 h-4" /> إعادة توجيه إلى...
          </h3>
          <button onClick={onClose} className="text-secondary-400 hover:text-secondary-600">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {conversations.map((item) => {
            const title = item.otherUser?.name || 'مستخدم';
            return (
              <button
                key={item.conversation.id}
                onClick={() => handleForward(item.conversation.id)}
                disabled={busyId !== null}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-secondary-50 text-right disabled:opacity-50"
              >
                <div className="w-9 h-9 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-semibold shrink-0">
                  {title.charAt(0)}
                </div>
                <span className="text-sm text-secondary-900 truncate">{title}</span>
                {busyId === item.conversation.id && <span className="text-xs text-secondary-400 mr-auto">جارِ...</span>}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
