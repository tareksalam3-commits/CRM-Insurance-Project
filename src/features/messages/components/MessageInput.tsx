import { useEffect, useMemo, useRef, useState } from 'react';
import { Send, Smile, X } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import type { MessageWithMeta } from '../types';
import * as messagesService from '../messagesService';
import { useMessageToast } from './MessageToast';

const QUICK_EMOJIS = [
  '😀', '😂', '🙂', '😍', '😢', '😮', '😡', '👍', '👎', '🙏',
  '👏', '🔥', '🎉', '❤️', '✅', '❌', '⏰', '📌', '💡', '🤔',
];

interface Props {
  conversationId: string;
  replyTo: MessageWithMeta | null;
  onClearReply: () => void;
  onSent: () => void;
  onTyping: () => void;
  onStopTyping: () => void;
}

interface MentionCandidate {
  id: string;
  name: string;
}

interface ActiveMentionQuery {
  /** موضع بداية الـ @ فى النص */
  startIndex: number;
  /** النص المكتوب بعد الـ @ (بدون الـ @ نفسها) */
  query: string;
}

export function MessageInput({ conversationId, replyTo, onClearReply, onSent, onTyping, onStopTyping }: Props) {
  const { user } = useAuth();
  const { showError } = useMessageToast();
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const typingTimeoutRef = useRef<number | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [members, setMembers] = useState<MentionCandidate[]>([]);
  const [mentionedUsers, setMentionedUsers] = useState<MentionCandidate[]>([]);
  const [mentionQuery, setMentionQuery] = useState<ActiveMentionQuery | null>(null);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [showEmoji, setShowEmoji] = useState(false);

  // جلب أعضاء المحادثة مرة واحدة (لاستخدامهم فى اقتراحات الإشارة بـ @) —
  // نستبعد المستخدم نفسه لأنه لا يشير لنفسه
  useEffect(() => {
    let cancelled = false;
    messagesService.fetchConversationMembers(conversationId).then((rows) => {
      if (cancelled) return;
      setMembers(rows.filter((r) => r.user_id !== user?.id).map((r) => ({ id: r.user_id, name: r.user.name })));
    });
    return () => { cancelled = true; };
  }, [conversationId, user?.id]);

  const suggestions = useMemo(() => {
    if (!mentionQuery) return [];
    const q = mentionQuery.query.trim().toLowerCase();
    const list = q
      ? members.filter((m) => m.name.toLowerCase().includes(q))
      : members;
    return list.slice(0, 6);
  }, [mentionQuery, members]);

  useEffect(() => { setHighlightedIndex(0); }, [mentionQuery?.query]);

  useEffect(() => {
    if (replyTo) textareaRef.current?.focus();
  }, [replyTo]);

  // تكشف عن "@" الجاري كتابتها حالياً بناءً على موضع المؤشر، وتحدّث حالة
  // اقتراحات الإشارة تبعاً لذلك (تظهر/تختفي/تتحدّث القائمة أثناء الكتابة)
  const detectMentionQuery = (text: string, cursorPos: number): ActiveMentionQuery | null => {
    const upToCursor = text.slice(0, cursorPos);
    const atIndex = upToCursor.lastIndexOf('@');
    if (atIndex === -1) return null;

    const charBeforeAt = atIndex > 0 ? upToCursor[atIndex - 1] : ' ';
    // الـ @ يجب أن تكون بداية كلمة (بعد مسافة/سطر جديد أو فى أول النص)
    if (!/\s/.test(charBeforeAt) && atIndex !== 0) return null;

    const afterAt = upToCursor.slice(atIndex + 1);
    // لو فيه مسافة أو سطر جديد بعد الـ @ يبقى المستخدم خرج من وضع الإشارة
    if (/\s/.test(afterAt)) return null;

    return { startIndex: atIndex, query: afterAt };
  };

  const handleChange = (v: string, cursorPos: number) => {
    setValue(v);
    onTyping();
    if (typingTimeoutRef.current) window.clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = window.setTimeout(() => onStopTyping(), 2500);
    setMentionQuery(detectMentionQuery(v, cursorPos));
  };

  const insertMention = (candidate: MentionCandidate) => {
    if (!mentionQuery) return;
    const before = value.slice(0, mentionQuery.startIndex);
    const after = value.slice(mentionQuery.startIndex + 1 + mentionQuery.query.length);
    const insertion = `@${candidate.name} `;
    const newValue = `${before}${insertion}${after}`;
    setValue(newValue);
    setMentionQuery(null);
    setMentionedUsers((prev) => (prev.some((m) => m.id === candidate.id) ? prev : [...prev, candidate]));

    requestAnimationFrame(() => {
      const pos = before.length + insertion.length;
      textareaRef.current?.focus();
      textareaRef.current?.setSelectionRange(pos, pos);
    });
  };

  const insertEmoji = (emoji: string) => {
    const el = textareaRef.current;
    const pos = el?.selectionStart ?? value.length;
    const newValue = value.slice(0, pos) + emoji + value.slice(pos);
    setValue(newValue);
    setShowEmoji(false);
    requestAnimationFrame(() => {
      const newPos = pos + emoji.length;
      el?.focus();
      el?.setSelectionRange(newPos, newPos);
    });
  };

  const handleSend = async () => {
    const content = value.trim();
    if (!content || sending) return;

    // نأخذ فقط الإشارات اللي أسماؤها لسه موجودة فعلياً فى النص (لو المستخدم
    // مسح جزء من الاسم بعد اختيار الإشارة، لا تُرسل إشارة خاطئة)
    const finalMentions = mentionedUsers.filter((m) => content.includes(`@${m.name}`));

    setSending(true);
    setValue('');
    setMentionedUsers([]);
    setMentionQuery(null);
    onStopTyping();
    try {
      await messagesService.sendMessage(conversationId, content, replyTo?.id ?? null, finalMentions.map((m) => m.id));
      onClearReply();
      onSent();
    } catch {
      setValue(content); // إعادة النص فى حالة فشل الإرسال
      showError('تعذّر إرسال الرسالة، حاول مرة أخرى');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (mentionQuery && suggestions.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex((i) => (i + 1) % suggestions.length);
        return;
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex((i) => (i - 1 + suggestions.length) % suggestions.length);
        return;
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault();
        insertMention(suggestions[highlightedIndex]);
        return;
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        setMentionQuery(null);
        return;
      }
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="border-t border-secondary-100 bg-white p-3 relative">
      {mentionQuery && suggestions.length > 0 && (
        <div className="absolute bottom-full mb-2 right-3 w-64 bg-white rounded-xl shadow-lg border border-secondary-100 py-1 z-20 max-h-56 overflow-y-auto">
          {suggestions.map((s, idx) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={(e) => { e.preventDefault(); insertMention(s); }}
              onMouseEnter={() => setHighlightedIndex(idx)}
              className={`w-full flex items-center gap-2 px-3 py-2 text-sm text-right ${idx === highlightedIndex ? 'bg-primary-50 text-primary-700' : 'hover:bg-secondary-50'}`}
            >
              <span className="w-7 h-7 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center text-xs font-semibold shrink-0">
                {s.name.charAt(0)}
              </span>
              <span className="truncate">{s.name}</span>
            </button>
          ))}
        </div>
      )}

      {replyTo && (
        <div className="flex items-center justify-between bg-secondary-50 rounded-lg px-3 py-2 mb-2 text-sm">
          <div className="truncate text-secondary-600">
            <span className="text-primary-600 font-medium">الرد على: </span>
            {replyTo.content.slice(0, 100)}
          </div>
          <button onClick={onClearReply} className="text-secondary-400 hover:text-secondary-600 shrink-0 ms-2">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
      <div className="flex items-end gap-2">
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => handleChange(e.target.value, e.target.selectionStart ?? e.target.value.length)}
          onKeyDown={handleKeyDown}
          onKeyUp={(e) => {
            const target = e.target as HTMLTextAreaElement;
            if (!['ArrowDown', 'ArrowUp', 'Enter', 'Tab', 'Escape'].includes(e.key)) {
              setMentionQuery(detectMentionQuery(target.value, target.selectionStart ?? target.value.length));
            }
          }}
          onClick={(e) => {
            const target = e.target as HTMLTextAreaElement;
            setMentionQuery(detectMentionQuery(target.value, target.selectionStart ?? target.value.length));
          }}
          placeholder="اكتب رسالة... (استخدم @ للإشارة إلى أحد الأعضاء)"
          rows={1}
          className="input-field flex-1 resize-none max-h-32"
        />
        <div className="relative shrink-0">
          {showEmoji && (
            <div className="absolute bottom-full mb-2 left-0 w-64 bg-white rounded-xl shadow-lg border border-secondary-100 p-2 grid grid-cols-6 gap-1 z-20">
              {QUICK_EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onMouseDown={(ev) => { ev.preventDefault(); insertEmoji(e); }}
                  className="text-xl hover:bg-secondary-50 rounded-lg py-1"
                >
                  {e}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => setShowEmoji((v) => !v)}
            className="btn btn-secondary shrink-0 !px-3"
            aria-label="اختيار رمز تعبيري"
          >
            <Smile className="w-4 h-4" />
          </button>
        </div>
        <button
          onClick={handleSend}
          disabled={!value.trim() || sending}
          className="btn btn-primary shrink-0 !px-3"
          aria-label="إرسال"
        >
          <Send className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}
