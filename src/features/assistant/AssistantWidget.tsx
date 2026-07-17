import { useEffect, useRef, useState } from 'react';
import { Sparkles, X, Send, Loader2, Lightbulb, Trash2, Copy, Check } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
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

// ---------------------------------------------------------------------------
// موضع الزر العائم: بيتحفظ آخر مكان اختاره المستخدم في localStorage، عشان
// يفضل ثابت في نفس المكان بين الجلسات بدل ما يرجع للوضع الافتراضي كل مرة.
// ---------------------------------------------------------------------------
const POSITION_STORAGE_KEY = 'assistant_widget_position_v1';
const BUTTON_SIZE = 48; // px — w-12 h-12
const DRAG_THRESHOLD = 6; // px — أقل من كده بيتحسب "ضغطة" مش "سحب"

type Point = { x: number; y: number };

function loadSavedPosition(): Point | null {
  try {
    const raw = localStorage.getItem(POSITION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.x === 'number' && typeof parsed?.y === 'number') return parsed;
  } catch {
    /* تجاهل */
  }
  return null;
}

function clampToViewport(p: Point): Point {
  const margin = 10;
  const isMobile = window.innerWidth < 768;
  // على الموبايل بنسيب مسافة كافية تحت عشان الزر متغطيش شريط التنقل السفلي
  const bottomSafe = isMobile ? 92 : margin;
  const maxX = window.innerWidth - BUTTON_SIZE - margin;
  const maxY = window.innerHeight - BUTTON_SIZE - bottomSafe;
  return {
    x: Math.min(Math.max(p.x, margin), Math.max(margin, maxX)),
    y: Math.min(Math.max(p.y, margin), Math.max(margin, maxY))
  };
}

export function AssistantWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // موضع الزر: null = الوضع الافتراضي (يتحكم فيه CSS)، وإلا إحداثيات محفوظة
  const [pos, setPos] = useState<Point | null>(() => loadSavedPosition());
  const dragState = useRef<{ startX: number; startY: number; startLeft: number; startTop: number } | null>(null);
  const wasDraggedRef = useRef(false);

  // إعادة ضبط الموضع المحفوظ لو اتغير حجم الشاشة (مثلاً تدوير الجهاز) عشان
  // الزر ميخرجش برا حدود الشاشة أو يتغطى بشريط التنقل
  useEffect(() => {
    const onResize = () => setPos((p) => (p ? clampToViewport(p) : p));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

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
      setTimeout(() => inputRef.current?.focus(), 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  // قفل تمرير الخلفية وإتاحة الإغلاق بمفتاح Escape أثناء فتح نافذة المساعد
  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', onKeyDown);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

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

  const handleClear = () => {
    setMessages([]);
    inputRef.current?.focus();
  };

  const handleCopy = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      setTimeout(() => setCopiedId((cur) => (cur === id ? null : cur)), 1500);
    } catch {
      /* المتصفح رفض الوصول للحافظة - نتجاهل بصمت */
    }
  };

  // ── التعامل مع سحب الزر العائم لتغيير مكانه (Pointer Events تدعم الماوس واللمس معًا) ──
  const handlePointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top
    };
    wasDraggedRef.current = false;
    buttonRef.current?.setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    if (!dragState.current) return;
    const dx = e.clientX - dragState.current.startX;
    const dy = e.clientY - dragState.current.startY;
    if (!wasDraggedRef.current && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    wasDraggedRef.current = true;
    setPos(
      clampToViewport({
        x: dragState.current.startLeft + dx,
        y: dragState.current.startTop + dy
      })
    );
  };

  const handlePointerUp = () => {
    if (dragState.current && wasDraggedRef.current) {
      setPos((p) => {
        if (p) {
          try {
            localStorage.setItem(POSITION_STORAGE_KEY, JSON.stringify(p));
          } catch {
            /* تجاهل */
          }
        }
        return p;
      });
    }
    dragState.current = null;
  };

  const handleButtonClick = () => {
    // لو كانت آخر تفاعلة سحب فعلي، متفتحش النافذة — الـ click بيتفعل تلقائيًا
    // بعد pointerup حتى لو كان سحب، فلازم نتجاهله مرة واحدة بس
    if (wasDraggedRef.current) {
      wasDraggedRef.current = false;
      return;
    }
    setOpen(true);
  };

  return (
    <>
      {/* الزر العائم — قابل للسحب لأي مكان، وبيتذكر آخر مكان اتحط فيه */}
      <button
        ref={buttonRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onClick={handleButtonClick}
        style={{
          touchAction: 'none',
          ...(pos ? { left: pos.x, top: pos.y, bottom: 'auto', right: 'auto' } : {})
        }}
        className={`fixed z-40 w-12 h-12 rounded-full select-none cursor-grab active:cursor-grabbing
                   bg-gradient-to-br from-primary-500 to-primary-700 hover:from-primary-600 hover:to-primary-800
                   active:scale-95 text-white shadow-lg shadow-primary-600/30 ring-1 ring-white/20
                   flex items-center justify-center transition-[background-color,box-shadow,transform] duration-200
                   ${pos ? '' : 'bottom-24 left-4 md:bottom-6 md:left-6'}`}
        aria-label="المساعد الذكي"
        title="المساعد الذكي"
      >
        <span className="absolute inset-0 rounded-full bg-primary-400/40 animate-ping" />
        <Sparkles className="w-5 h-5 relative" />
      </button>

      {/* النافذة المنبثقة */}
      {open && (
        <div
          className={`fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/45 backdrop-blur-[2px]
                      transition-opacity duration-150 ease-out ${mounted ? 'opacity-100' : 'opacity-0'}`}
          onClick={handleClose}
        >
          <div
            className={`bg-white w-full md:max-w-lg md:rounded-2xl rounded-t-2xl shadow-2xl ring-1 ring-black/5
                        max-h-[85vh] flex flex-col overflow-hidden
                        transition-all duration-150 ease-out ${mounted ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-6 scale-[0.98]'}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* الرأس */}
            <div className="flex items-center justify-between px-4 h-16 border-b border-secondary-200 flex-shrink-0
                            bg-gradient-to-l from-primary-50 via-primary-50/60 to-white">
              <div className="flex items-center gap-2.5">
                <div className="relative w-9 h-9 rounded-full bg-gradient-to-br from-primary-500 to-primary-700 flex items-center justify-center flex-shrink-0 shadow-sm">
                  <Sparkles className="w-4.5 h-4.5 text-white" />
                  <span className="absolute -bottom-0.5 -end-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-white" />
                </div>
                <div>
                  <h3 className="font-bold text-secondary-900 text-sm leading-tight">المساعد الذكي</h3>
                  <p className="text-[11px] text-secondary-400 leading-tight">اسأل بلهجتك، هيفهمك على طول</p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                {messages.length > 0 && (
                  <button
                    onClick={handleClear}
                    className="p-1.5 rounded-lg hover:bg-secondary-100 text-secondary-400 hover:text-secondary-600 transition-colors"
                    aria-label="مسح المحادثة"
                    title="مسح المحادثة"
                  >
                    <Trash2 className="w-4 h-4" />
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
                <MessageBubble
                  key={m.id}
                  message={m}
                  onSuggestion={ask}
                  onCopy={handleCopy}
                  copied={copiedId === m.id}
                />
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
            <form onSubmit={handleSubmit} className="flex gap-2 p-3 border-t border-secondary-200 flex-shrink-0 safe-area-bottom">
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
  onSuggestion,
  onCopy,
  copied
}: {
  message: ChatMessage;
  onSuggestion: (text: string) => void | Promise<void>;
  onCopy: (id: string, text: string) => void;
  copied: boolean;
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
  const copyText = [message.title, ...(message.lines ?? [])].filter(Boolean).join('\n');

  return (
    <div className="flex justify-start group">
      <div className="max-w-[90%] bg-primary-50/70 border border-primary-100 rounded-2xl rounded-ss-sm px-4 py-3 relative">
        {message.title && <p className="font-bold text-primary-700 text-sm mb-1.5 pe-5">{message.title}</p>}

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

        {copyText && (
          <button
            onClick={() => onCopy(message.id, copyText)}
            className="absolute top-2.5 end-2.5 p-1 rounded-md text-primary-400 hover:text-primary-600
                       hover:bg-white/70 opacity-70 md:opacity-0 md:group-hover:opacity-100 focus:opacity-100 transition-opacity"
            aria-label="نسخ الرد"
            title="نسخ الرد"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
    </div>
  );
}

// --------------------------------------------------------------------------
// مؤشر "بيفكر / بيحلل البيانات..." أثناء انتظار الرد
// --------------------------------------------------------------------------
function TypingIndicator() {
  return (
    <div className="flex justify-start">
      <div className="bg-primary-50/70 border border-primary-100 rounded-2xl rounded-ss-sm px-4 py-3 flex gap-2 items-center">
        <span className="flex gap-1 items-center">
          <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-bounce [animation-delay:-0.3s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-bounce [animation-delay:-0.15s]" />
          <span className="w-1.5 h-1.5 rounded-full bg-primary-400 animate-bounce" />
        </span>
        <span className="text-xs text-primary-400">بيحلل البيانات...</span>
      </div>
    </div>
  );
}
