import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUp, Info, Pin } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { useConversationMessages, useTypingIndicator } from '../useMessagesRealtime';
import { MessageBubble } from './MessageBubble';
import { MessageInput } from './MessageInput';
import * as messagesService from '../messagesService';
import type { ConversationListItem, MessageWithMeta } from '../types';
import { ROLE_LABELS } from '../../../lib/supabase';

interface Props {
  item: ConversationListItem;
  onOpenInfo: () => void;
  onBack: () => void; // للعودة لقائمة المحادثات فى الموبايل
  onForwardRequest: (message: MessageWithMeta) => void;
}

const NEAR_BOTTOM_THRESHOLD = 120;

export function ChatWindow({ item, onOpenInfo, onBack, onForwardRequest }: Props) {
  const { user } = useAuth();
  const { conversation, otherUser, member } = item;
  const { messages, loading, hasMore, loadOlder, reload } = useConversationMessages(conversation.id);
  const { typingUserIds, notifyTyping, stopTyping } = useTypingIndicator(conversation.id);
  const [replyTo, setReplyTo] = useState<MessageWithMeta | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [unreadJumpDismissed, setUnreadJumpDismissed] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadingOlderRef = useRef(false);
  const prevScrollHeightRef = useRef(0);
  const prevMessageCountRef = useRef(0);

  useEffect(() => {
    messagesService.markConversationRead(conversation.id);
  }, [conversation.id, messages.length]);

  useEffect(() => {
    setUnreadJumpDismissed(false);
  }, [conversation.id]);

  // الحفاظ على موضع التمرير عند تحميل رسائل أقدم لأعلى (بدلاً من قفزه للأعلى/الأسفل)
  useLayoutEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    if (loadingOlderRef.current) {
      const added = messages.length - prevMessageCountRef.current;
      if (added > 0) {
        el.scrollTop = el.scrollHeight - prevScrollHeightRef.current + el.scrollTop;
      }
      loadingOlderRef.current = false;
    } else if (isNearBottom) {
      bottomRef.current?.scrollIntoView({ behavior: prevMessageCountRef.current === 0 ? 'auto' : 'smooth' });
    }
    prevMessageCountRef.current = messages.length;
  }, [messages.length]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < NEAR_BOTTOM_THRESHOLD;
    setIsNearBottom(nearBottom);
    if (el.scrollTop < 80 && hasMore && !loadingOlderRef.current) {
      loadingOlderRef.current = true;
      prevScrollHeightRef.current = el.scrollHeight;
      setLoadingOlder(true);
      loadOlder().finally(() => setLoadingOlder(false));
    }
  };

  const scrollToBottom = () => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // أول رسالة غير مقروءة: أول رسالة وصلت بعد آخر قراءة مسجّلة للمستخدم فى هذه المحادثة
  const unreadStartIndex = (() => {
    if (!item.unreadCount || item.unreadCount <= 0) return -1;
    if (!member.last_read_at) return messages.findIndex((m) => m.sender_id !== user?.id);
    const lastRead = new Date(member.last_read_at).getTime();
    return messages.findIndex((m) => new Date(m.created_at).getTime() > lastRead && m.sender_id !== user?.id);
  })();

  const jumpToFirstUnread = () => {
    const el = document.getElementById(`msg-${messages[unreadStartIndex]?.id}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setUnreadJumpDismissed(true);
  };

  const title = otherUser?.name || 'مستخدم';
  const subtitle = otherUser ? (otherUser.is_online ? 'متصل الآن' : ROLE_LABELS[otherUser.role]) : '';

  const pinnedMessages = messages.filter((m) => m.is_pinned && !m.is_deleted);

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* رأس المحادثة */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-100 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <button onClick={onBack} className="md:hidden text-secondary-400 shrink-0" aria-label="رجوع">
            <ArrowRight className="w-5 h-5" />
          </button>
          <div className="w-10 h-10 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center font-semibold shrink-0">
            {title.charAt(0)}
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-secondary-900 truncate">{title}</div>
            <div className="text-xs text-secondary-400 truncate">
              {typingUserIds.length > 0 ? 'يكتب الآن...' : subtitle}
            </div>
          </div>
        </div>
        <button onClick={onOpenInfo} className="text-secondary-400 hover:text-secondary-600 shrink-0" aria-label="معلومات المحادثة">
          <Info className="w-5 h-5" />
        </button>
      </div>

      {/* الرسائل المثبّتة */}
      {pinnedMessages.length > 0 && (
        <div className="flex items-center gap-2 px-4 py-1.5 bg-warning-50 text-warning-700 text-xs border-b border-warning-100 overflow-hidden">
          <Pin className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{pinnedMessages[pinnedMessages.length - 1].content}</span>
        </div>
      )}

      {/* زر الانتقال لأول رسالة غير مقروءة */}
      {unreadStartIndex > -1 && !unreadJumpDismissed && (
        <button
          onClick={jumpToFirstUnread}
          className="flex items-center justify-center gap-1.5 py-1.5 text-xs bg-primary-50 text-primary-700 border-b border-primary-100 hover:bg-primary-100"
        >
          <ArrowUp className="w-3.5 h-3.5" /> الانتقال إلى أول رسالة غير مقروءة ({item.unreadCount})
        </button>
      )}

      {/* الرسائل */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-3 relative">
        {loading ? (
          <div className="flex justify-center py-8 text-secondary-400 text-sm">جارِ التحميل...</div>
        ) : messages.length === 0 ? (
          <div className="flex justify-center py-8 text-secondary-400 text-sm">لا توجد رسائل بعد — ابدأ المحادثة</div>
        ) : (
          <>
            {loadingOlder && (
              <div className="flex justify-center py-2 text-secondary-300 text-xs">جارِ تحميل رسائل أقدم...</div>
            )}
            {messages.map((m) => {
              return (
                <div id={`msg-${m.id}`} key={m.id}>
                  <MessageBubble
                    message={m}
                    isOwn={m.sender_id === user?.id}
                    showSenderName={false}
                    onReply={setReplyTo}
                    onForward={onForwardRequest}
                    onChanged={reload}
                  />
                </div>
              );
            })}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {/* زر العودة للأسفل عند وجود رسائل جديدة والمستخدم مبتعد عن نهاية المحادثة */}
      {!isNearBottom && messages.length > 0 && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-white shadow-lg border border-secondary-100 flex items-center justify-center text-secondary-500 hover:text-primary-600 z-10"
          aria-label="الانتقال لآخر الرسائل"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      <MessageInput
        conversationId={conversation.id}
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        onSent={reload}
        onTyping={notifyTyping}
        onStopTyping={stopTyping}
      />
    </div>
  );
}
