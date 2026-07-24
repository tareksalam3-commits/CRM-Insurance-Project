import { useRef, useState } from 'react';
import { Send, Smile, X } from 'lucide-react';
import type { TeamRoomMessageWithMeta } from '../types';
import * as teamRoomService from '../teamRoomService';
import { useMessageToast } from '../../messages/components/MessageToast';

const QUICK_EMOJIS = [
  '😀', '😂', '🙂', '😍', '😢', '😮', '😡', '👍', '👎', '🙏',
  '👏', '🔥', '🎉', '❤️', '✅', '❌', '⏰', '📌', '💡', '🤔',
];

interface Props {
  replyTo: TeamRoomMessageWithMeta | null;
  onClearReply: () => void;
  onSent: () => void;
  disabled?: boolean;
}

export function TeamRoomMessageInput({ replyTo, onClearReply, onSent, disabled }: Props) {
  const { showError } = useMessageToast();
  const [value, setValue] = useState('');
  const [sending, setSending] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

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
    if (!content || sending || disabled) return;

    setSending(true);
    setValue('');
    try {
      await teamRoomService.sendTeamRoomMessage(content, replyTo?.id ?? null);
      onClearReply();
      onSent();
    } catch {
      setValue(content);
      showError('تعذّر إرسال الرسالة، حاول مرة أخرى');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  if (disabled) {
    return (
      <div className="border-t border-secondary-100 bg-secondary-50 p-3 text-center text-sm text-secondary-400">
        أنت تشاهد غرفة الفريق فقط — لا يمكنك إرسال رسائل هنا
      </div>
    );
  }

  return (
    <div className="border-t border-secondary-100 bg-white p-3 relative">
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
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="اكتب رسالة فى غرفة الفريق..."
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
