import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Send, Loader2, Lightbulb, RotateCcw } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { User } from '../../lib/supabase';
import { QUICK_COMMANDS, runQuickCommand, parseAndAnswer } from './assistantEngine';
import { AssistantAnswer, getDailyTip } from './assistantData';

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'tip';
  text?: string;
  title?: string;
  lines?: string[];
  suggestions?: string[];
}

let idCounter = 0;
function nextId(): string {
  idCounter += 1;
  return `msg-${idCounter}-${Date.now()}`;
}

export function AssistantWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // فتح/غلق بحركة انتقالية بسيطة (fade + slide) بدون الاعتماد على أي مكتبة خارجية
  useEffect(() => {
    if (open) {
      const frame = requestAnimationFrame(() => setMounted(true));
      return () => cancelAnimationFrame(frame);
    }
    setMounted(false);
  }, [open]);

  // نصيحة اليوم تظهر تلقائيًا أول ما المستخدم يفتح المساعد (لو فيه نصيحة فعلية)
  useEffect(() => {
    if (open && messages.length === 0 && user) {
      getDailyTip(user).then((tip) => {
        if (tip) {
          setMessages([{ id: nextId(), role: 'tip', text: tip }]);
        }
      });
      setTimeout(() => inputRef.current?.focus(), 250);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  if (!user) return null;

  const pushUserMessage = (text: string) => {
    setMessages((prev) => [...prev, { id: nextId(), role: 'user', text }]);
  };

  const pushAnswer = (answer: AssistantAnswer) => {
    setMessages((prev) => [
      ...prev,
      {
        id: nextId(),
        role: 'assistant',
        title: answer.title,
        lines: answer.lines,
        suggestions: answer.suggestions
      }
    ]);
  };

  const ask = async (text: string) => {
    const clean = text.trim();
    if (!clean || loading) return;
    pushUserMessage(clean);
    setQuery('');
    setLoading(true);
    try {
      const result = await parseAndAnswer(clean, user);
      pushAnswer(result);
    } finally {
      setLoading(false);
      inputRef.current?.focus();
    }
  };

  const handleQuickCommand = async (id: string, label: string) => {
    if (loading) return;
    pushUserMessage(label);
    setLoading(true);
    try {
      const result = await runQuickCommand(id, user);
      pushAnswer(result);
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    ask(query);
  };

  const handleClose = () => {
    setOpen(false);
    setQuery('');
  };

  const handleReset = () => {
    setMessages([]);
    inputRef.current?.focus();
  };

  return (
    <>
      {/* الزر العائم */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 left-4 md:bottom-6 md:left-6 z-40 w-14 h-14 rounded-full
                   bg-gradient-to-br from-primary-500 to-primary-700 hover:from-primary-600 hover:to-primary-800
                   active:scale-95 text-white shadow-lg shadow-primary-600/30 flex items-center justify-center
                   transition-all duration-200"
        aria-label="المساعد الذكي"
      >
        <span className="absolute inset-0 rounded-full bg-primary-400/40 animate-ping" />
        <Sparkles className="w-6 h-6 relative" />
      </button>

      {/* النافذة المنبثقة */}
      {open && (
        <div
          className={`fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40
                      transition-opacity duration-200 ${mounted ? 'opacity-100' : 'opacity-0'}`}
          onClick={handleClose}
        >
          <div
            className={`bg-white w-full md:max-w-lg md:rounded-2xl rounded-t-2xl shadow-2xl
                        max-h-[85vh] flex flex-col overflow-hidden
                        transition-all duration-200 ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* الرأس */}
            <div className="flex items-center justify-between px-4 h-16 border-b border-secondary-200 flex-shrink-0
                            bg-gradient-to-l from-primary-50 to-white">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-primary-600 flex items-center justify-center flex-shrink-0">
                  <Sparkles className="w-4.5 h-4.5 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-secondary-900 text-sm leading-tight">المساعد الذكي</h3>
                  <p className="text-[11px] text-secondary-400 leading-tight">اسأل بلهجتك، هيفهمك على طول</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={handleReset}
                    className="p-1.5 rounded-lg hover:bg-secondary-100 text-secondary-400 transition-colors"
                    aria-label="محادثة جديدة"
                    title="محادثة جديدة"
                  >
                    <RotateCcw className="w-4 h-4" />
                  </button>
                )}
                <button
                  onClick={handleClose}
                  className="p-1.5 rounded-lg hover:bg-secondary-100 text-secondary-500 transition-colors"
                  aria-label="إغلاق"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* منطقة المحادثة */}
            <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
              {messages.length === 0 && (
                <div className="py-2">
                  <p className="text-sm text-secondary-400 text-center mb-4">
                    اسأل أي سؤال عن أدائك، أو اختَر أحد الأوامر السريعة
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    {QUICK_COMMANDS.map((cmd) => (
                      <button
                        key={cmd.id}
                        onClick={() => handleQuickCommand(cmd.id, cmd.label)}
                        className="bg-secondary-50 hover:bg-secondary-100 border border-secondary-200
                                   rounded-xl px-3 py-2.5 text-xs font-medium text-secondary-700
                                   transition-colors text-start"
                      >
                        {cmd.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {messages.map((m) => (
                <MessageBubble key={m.id} message={m} onSuggestion={ask} />
              ))}

              {loading && <TypingIndicator />}
            </div>

            {/* شريط الأوامر السريعة - يظهر أثناء المحادثة كمان لسهولة الوصول */}
            {messages.length > 0 && (
              <div className="px-4 pt-2 flex-shrink-0 border-t border-secondary-100">
                <div className="flex gap-2 overflow-x-auto py-2">
                  {QUICK_COMMANDS.map((cmd) => (
                    <button
                      key={cmd.id}
                      onClick={() => handleQuickCommand(cmd.id, cmd.label)}
                      disabled={loading}
                      className="rounded-full bg-secondary-100 text-secondary-700 hover:bg-secondary-200
                                 px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50
                                 whitespace-nowrap flex-shrink-0"
                    >
                      {cmd.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* مربع الإدخال */}
            <form onSubmit={handleSubmit} className="flex gap-2 p-3 border-t border-secondary-200 flex-shrink-0">
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="اسأل سؤالك... مثال: كم المتبقي على الهدف؟"
                className="input-field flex-1"
                disabled={loading}
              />
              <button
                type="submit"
                className="w-11 h-11 rounded-xl bg-primary-600 hover:bg-primary-700 disabled:opacity-40
                           disabled:hover:bg-primary-600 text-white flex items-center justify-center
                           flex-shrink-0 transition-colors"
                disabled={loading || !query.trim()}
                aria-label="إرسال"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
              </button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

// --------------------------------------------------------------------------
// فقاعة رسالة واحدة (سؤال المستخدم / رد المساعد / نصيحة اليوم)
// --------------------------------------------------------------------------
function MessageBubble({
  message,
  onSuggestion
}: {
  message: ChatMessage;
  onSuggestion: (text: string) => void | Promise<void>;
}) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] bg-primary-600 text-white rounded-2xl rounded-se-sm px-4 py-2 text-sm leading-relaxed">
          {message.text}
        </div>
      </div>
    );
  }

  if (message.role === 'tip') {
    return (
      <div className="flex items-start gap-2 bg-amber-50 border border-amber-100 rounded-xl px-3 py-2.5">
        <Lightbulb className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-amber-800 leading-relaxed">{message.text}</p>
      </div>
    );
  }

  // رد المساعد
  return (
    <div className="flex justify-start">
      <div className="max-w-[90%] bg-primary-50/70 border border-primary-100 rounded-2xl rounded-ss-sm px-4 py-3">
        {message.title && <p className="font-bold text-primary-700 text-sm mb-1.5">{message.title}</p>}

        {message.suggestions && message.suggestions.length > 0 ? (
          <div className="flex flex-col gap-1.5 mt-1">
            {message.suggestions.map((s, idx) => (
              <button
                key={idx}
                onClick={() => onSuggestion(s)}
                className="text-start text-xs bg-white hover:bg-primary-100/60 border border-primary-200
                           text-primary-700 rounded-lg px-3 py-1.5 transition-colors"
              >
                {s}
              </button>
            ))}
          </div>
        ) : (
          <ul className="space-y-1">
            {message.lines?.map((line, idx) => (
              <li key={idx} className="text-sm text-secondary-700 leading-relaxed flex items-start gap-1.5">
                <span className="mt-2 w-1 h-1 rounded-full bg-primary-400 flex-shrink-0" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// مؤشر "بيكتب..." أثناء انتظار الرد، بدل سبينر مجرّد
// --------------------------------------------------------------------------
function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-primary-50/70 border border-primary-100 rounded-2xl rounded-ss-sm px-4 py-3 flex gap-1 items-center">
        <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-bounce [animation-delay:-0.3s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-bounce [animation-delay:-0.15s]" />
        <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-bounce" />
      </div>
    </div>
  );
}
