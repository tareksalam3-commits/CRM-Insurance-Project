import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, MessageSquare } from 'lucide-react';
import clsx from 'clsx';
import { useAuth } from '../hooks/useAuth';
import { canAccessMessages, canAccessTeamRoom } from '../config/navigation';
import {
  useConversationsList, useOnlinePresenceHeartbeat,
} from '../features/messages/useMessagesRealtime';
import { ConversationList } from '../features/messages/components/ConversationList';
import { ChatWindow } from '../features/messages/components/ChatWindow';
import { NewConversationModal } from '../features/messages/components/NewConversationModal';
import { ConversationInfoPanel } from '../features/messages/components/ConversationInfoPanel';
import { ForwardMessageModal } from '../features/messages/components/ForwardMessageModal';
import { MessageToastProvider, useMessageToast } from '../features/messages/components/MessageToast';
import { TeamRoomPanel } from './TeamRoom';
import * as messagesService from '../features/messages/messagesService';
import type { ConversationListItem, MessageWithMeta } from '../features/messages/types';

// معرّف وهمي (ليس UUID محادثة حقيقية) يمثل غرفة الفريق داخل نفس آلية الاختيار
// المستخدمة للمحادثات العادية، حتى تعمل ضمن نفس منطق القائمة/الرجوع بالمتصفح.
const TEAM_ROOM_KEY = 'team-room';

function MessagesInner() {
  const { user } = useAuth();
  const canMessage = user ? canAccessMessages(user.role) : false;
  const canTeamRoom = user ? canAccessTeamRoom(user.role) : false;
  const { items, loading, reload } = useConversationsList();
  useOnlinePresenceHeartbeat();
  const { showError } = useMessageToast();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [showNewConversation, setShowNewConversation] = useState(false);
  const [showInfo, setShowInfo] = useState(false);
  const [forwardingMessage, setForwardingMessage] = useState<MessageWithMeta | null>(null);
  const [creatingConversation, setCreatingConversation] = useState(false);

  // من لا يملك صلاحية الرسائل المباشرة (مثل Super Admin) لا يرى إلا غرفة
  // الفريق، ويُثبَّت اختياره عليها دائماً لعدم وجود قائمة محادثات له أصلاً.
  const rawSelection = canMessage ? searchParams.get('c') : TEAM_ROOM_KEY;
  const isTeamRoomSelected = rawSelection === TEAM_ROOM_KEY;
  const activeConversationId = !isTeamRoomSelected ? rawSelection : null;
  const activeItem: ConversationListItem | undefined = items.find((it) => it.conversation.id === activeConversationId);

  // فتح محادثة (أو غرفة الفريق): يضيف خطوة جديدة فى تاريخ المتصفح فقط عند
  // الانتقال من "القائمة" لأول محادثة (لتفعيل زر الرجوع). أما التنقل بين
  // محادثات مختلفة أثناء وجود محادثة مفتوحة بالفعل (مثلاً من قائمة سطح
  // المكتب الظاهرة باستمرار) فيستخدم "استبدال" الخطوة الحالية بدل تكديس خطوة
  // جديدة لكل محادثة يتم تصفّحها — بحيث يرجعك زر الرجوع للقائمة مباشرة دائماً
  // بضغطة واحدة، مهما كان عدد المحادثات التى فتحتها فى نفس الجلسة.
  const openSelection = useCallback((key: string) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('c', key);
      return next;
    }, { replace: !!searchParams.get('c') });
  }, [searchParams, setSearchParams]);

  // ملحوظة: صفحة الرسائل تفتح دائماً على قائمة المحادثات (بدون فتح آخر محادثة
  // تلقائياً) — تم إلغاء هذا السلوك بناءً على طلب مباشر.

  const handleSelect = (item: ConversationListItem) => {
    openSelection(item.conversation.id);
    setShowInfo(false);
  };

  const handleSelectTeamRoom = () => {
    openSelection(TEAM_ROOM_KEY);
    setShowInfo(false);
  };

  // زر الرجوع (فى الموبايل) وزر رجوع المتصفح/الجهاز يجب أن يتصرفا بنفس الطريقة:
  // العودة لقائمة المحادثات دون مغادرة صفحة الرسائل. بما أن أول محادثة يتم
  // فتحها من القائمة تضيف خطوة واحدة فقط فى تاريخ المتصفح (انظر openSelection)،
  // فإن الرجوع خطوة واحدة يعيدنا دائماً لصفحة الرسائل بدون معامل، أى للقائمة.
  const handleBack = () => {
    if (searchParams.get('c')) {
      navigate(-1);
    } else {
      setSearchParams({}, { replace: true });
    }
  };

  const handleSelectNewUser = async (userId: string) => {
    setCreatingConversation(true);
    try {
      const conversationId = await messagesService.getOrCreateDirectConversation(userId);
      setShowNewConversation(false);
      openSelection(conversationId);
      await reload();
    } catch {
      showError('تعذّر بدء المحادثة، حاول مرة أخرى');
    } finally {
      setCreatingConversation(false);
    }
  };

  return (
    <div className="h-[calc(100dvh-9.25rem)] md:h-[calc(100dvh-7rem)] flex overflow-hidden rounded-xl border border-secondary-100 bg-white relative">
      {/* قائمة المحادثات — لا تظهر إطلاقاً لمن لا يملك صلاحية الرسائل المباشرة
          (مثل Super Admin)، وتُخفى فى الموبايل عند فتح محادثة أو غرفة الفريق */}
      {canMessage && (
        <div className={clsx('w-full md:w-80 shrink-0', (activeConversationId || isTeamRoomSelected) ? 'hidden md:block' : 'block')}>
          {loading ? (
            <div className="h-full flex flex-col">
              <div className="px-4 py-3 border-b border-secondary-100">
                <div className="h-6 w-24 bg-secondary-100 rounded animate-pulse" />
              </div>
              <div className="p-4 space-y-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="flex items-center gap-3 animate-pulse">
                    <div className="w-11 h-11 rounded-full bg-secondary-100 shrink-0" />
                    <div className="flex-1 space-y-2">
                      <div className="h-3 w-2/3 bg-secondary-100 rounded" />
                      <div className="h-2.5 w-1/2 bg-secondary-100 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <ConversationList
              items={items}
              activeConversationId={activeConversationId}
              onSelect={handleSelect}
              onNewConversation={() => setShowNewConversation(true)}
              onChanged={reload}
              showTeamRoom={canTeamRoom}
              isTeamRoomActive={isTeamRoomSelected}
              onSelectTeamRoom={handleSelectTeamRoom}
            />
          )}
        </div>
      )}

      {/* نافذة المحادثة أو غرفة الفريق */}
      <div className={clsx('flex-1 min-w-0 flex-col', (activeConversationId || isTeamRoomSelected) ? 'flex' : 'hidden md:flex')}>
        {isTeamRoomSelected ? (
          <TeamRoomPanel onBack={canMessage ? handleBack : undefined} />
        ) : activeItem ? (
          <ChatWindow
            item={activeItem}
            onOpenInfo={() => setShowInfo(true)}
            onBack={handleBack}
            onForwardRequest={setForwardingMessage}
          />
        ) : (
          <div className="flex-1 flex flex-col min-h-0">
            {/* زر الرجوع يظل ظاهراً دائماً فى الموبايل طالما فيه محادثة مختارة،
                حتى أثناء اللحظة القصيرة التى تُحمَّل فيها بيانات المحادثة */}
            {activeConversationId && (
              <div className="md:hidden flex items-center px-4 py-3 border-b border-secondary-100 shrink-0">
                <button
                  onClick={handleBack}
                  className="text-secondary-400"
                  aria-label="رجوع"
                >
                  <ArrowRight className="w-5 h-5" />
                </button>
              </div>
            )}
            <div className="flex-1 flex flex-col items-center justify-center text-secondary-300 gap-3 px-6 text-center">
              {loading ? null : items.length === 0 ? (
                <>
                  <MessageSquare className="w-16 h-16" />
                  <span className="text-secondary-500 font-medium">لا توجد محادثات بعد</span>
                  <span className="text-sm">ابدأ أول محادثة لك بالضغط على زر "إرسال رسالة"</span>
                  <button onClick={() => setShowNewConversation(true)} className="btn btn-primary mt-2">إرسال رسالة</button>
                </>
              ) : (
                <>
                  <MessageSquare className="w-16 h-16" />
                  <span className="text-sm">اختر محادثة لبدء المراسلة</span>
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* لوحة معلومات المحادثة */}
      {showInfo && activeItem && (
        <div className="absolute md:relative inset-0 md:inset-auto z-30 md:z-auto">
          <ConversationInfoPanel item={activeItem} onClose={() => setShowInfo(false)} onChanged={reload} />
        </div>
      )}

      {showNewConversation && (
        <NewConversationModal
          onClose={() => !creatingConversation && setShowNewConversation(false)}
          onSelectUser={handleSelectNewUser}
        />
      )}

      {forwardingMessage && (
        <ForwardMessageModal
          message={forwardingMessage}
          conversations={items}
          onClose={() => setForwardingMessage(null)}
          onForwarded={reload}
        />
      )}
    </div>
  );
}

export function Messages() {
  return (
    <MessageToastProvider>
      <MessagesInner />
    </MessageToastProvider>
  );
}
