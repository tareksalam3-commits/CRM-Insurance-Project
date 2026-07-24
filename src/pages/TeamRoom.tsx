import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowRight, Info, Users } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useTeamRoomMessages } from '../features/teamRoom/useTeamRoomRealtime';
import { TeamRoomMessageBubble } from '../features/teamRoom/components/TeamRoomMessageBubble';
import { TeamRoomMessageInput } from '../features/teamRoom/components/TeamRoomMessageInput';
import type { TeamRoomMessageWithMeta } from '../features/teamRoom/types';

const NEAR_BOTTOM_THRESHOLD = 120;

interface TeamRoomPanelProps {
  /** لو موجودة، يظهر زر رجوع فى الموبايل (للعودة لقائمة المحادثات فى صفحة الرسائل) */
  onBack?: () => void;
}

// غرفة الفريق أصبحت مدمجة داخل صفحة "الرسائل" (وليست صفحة مستقلة)، لذلك هذا
// المكوّن الآن يملأ ارتفاع أبيه (h-full) بدلاً من حجز ارتفاع صفحة كاملة بنفسه،
// ولا يرسم إطاره/حدوده الخاصة — تلك تأتي من حاوية صفحة الرسائل نفسها.
export function TeamRoomPanel({ onBack }: TeamRoomPanelProps) {
  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';
  const { messages, loading, hasMore, loadOlder, reload } = useTeamRoomMessages();

  const [replyTo, setReplyTo] = useState<TeamRoomMessageWithMeta | null>(null);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const loadingOlderRef = useRef(false);
  const prevScrollHeightRef = useRef(0);
  const prevMessageCountRef = useRef(0);

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

  const scrollToBottom = () => bottomRef.current?.scrollIntoView({ behavior: 'smooth' });

  return (
    <div className="flex flex-col h-full bg-white relative">
      {/* رأس الغرفة */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-secondary-100 shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          {onBack && (
            <button onClick={onBack} className="md:hidden text-secondary-400 shrink-0" aria-label="رجوع">
              <ArrowRight className="w-5 h-5" />
            </button>
          )}
          <div className="w-10 h-10 rounded-full bg-info-100 text-info-700 flex items-center justify-center shrink-0">
            <Users className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="font-semibold text-secondary-900 truncate">غرفة الفريق</div>
            <div className="text-xs text-secondary-400 truncate">
              {isSuperAdmin ? 'وضع المشاهدة — كل رسائل الغرفة' : 'كل مستخدم يرى فقط الرسائل ضمن نطاقه'}
            </div>
          </div>
        </div>
        <button onClick={() => setShowInfo((v) => !v)} className="text-secondary-400 hover:text-secondary-600 shrink-0" aria-label="معلومات الغرفة">
          <Info className="w-5 h-5" />
        </button>
      </div>

      {showInfo && (
        <div className="px-4 py-2.5 bg-info-50 text-info-700 text-xs border-b border-info-100">
          كل رسالة تصل تلقائياً لمن يخصّه فقط حسب الهيكل الوظيفي: الإيجنت لرئيس مجموعته المباشر، رئيس المجموعة لإيجنته والمراقب المباشر، وهكذا صعوداً. لا يمكنك رؤية أي رسالة خارج نطاقك.
        </div>
      )}

      {/* الرسائل */}
      <div ref={scrollRef} onScroll={handleScroll} className="flex-1 overflow-y-auto px-4 py-3 relative">
        {loading ? (
          <div className="flex justify-center py-8 text-secondary-400 text-sm">جارِ التحميل...</div>
        ) : messages.length === 0 ? (
          <div className="flex justify-center py-8 text-secondary-400 text-sm">لا توجد رسائل بعد</div>
        ) : (
          <>
            {loadingOlder && (
              <div className="flex justify-center py-2 text-secondary-300 text-xs">جارِ تحميل رسائل أقدم...</div>
            )}
            {messages.map((m, idx) => {
              const prevSameSender = idx > 0 && messages[idx - 1].sender_id === m.sender_id;
              return (
                <div id={`team-room-msg-${m.id}`} key={m.id}>
                  <TeamRoomMessageBubble
                    message={m}
                    isOwn={!isSuperAdmin && m.sender_id === user?.id}
                    showSenderName={!prevSameSender}
                    canDeleteAny={isSuperAdmin}
                    onReply={setReplyTo}
                    onChanged={reload}
                  />
                </div>
              );
            })}
          </>
        )}
        <div ref={bottomRef} />
      </div>

      {!isNearBottom && messages.length > 0 && (
        <button
          onClick={scrollToBottom}
          className="absolute bottom-24 left-1/2 -translate-x-1/2 w-9 h-9 rounded-full bg-white shadow-lg border border-secondary-100 flex items-center justify-center text-secondary-500 hover:text-primary-600 z-10"
          aria-label="الانتقال لآخر الرسائل"
        >
          <ArrowDown className="w-4 h-4" />
        </button>
      )}

      <TeamRoomMessageInput
        replyTo={replyTo}
        onClearReply={() => setReplyTo(null)}
        onSent={reload}
        disabled={isSuperAdmin}
      />
    </div>
  );
}
