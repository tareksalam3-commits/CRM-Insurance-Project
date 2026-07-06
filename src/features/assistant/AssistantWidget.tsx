import { useState } from 'react';
import { Sparkles, X, Search, Loader2 } from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { QUICK_COMMANDS, runQuickCommand, parseAndAnswer } from './assistantEngine';
import { AssistantAnswer } from './assistantData';

export function AssistantWidget() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [answer, setAnswer] = useState<AssistantAnswer | null>(null);

  if (!user) return null;

  const handleQuickCommand = async (id: string) => {
    setLoading(true);
    setAnswer(null);
    try {
      const result = await runQuickCommand(id, user);
      setAnswer(result);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setAnswer(null);
    try {
      const result = await parseAndAnswer(query, user);
      setAnswer(result);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setOpen(false);
    setQuery('');
    setAnswer(null);
  };

  return (
    <>
      {/* الزر العائم */}
      <button
        onClick={() => setOpen(true)}
        className="fixed bottom-24 left-4 md:bottom-6 md:left-6 z-40 w-14 h-14 rounded-full
                   bg-primary-600 hover:bg-primary-700 active:scale-95 text-white
                   shadow-lg shadow-primary-600/30 flex items-center justify-center
                   transition-all duration-200"
        aria-label="المساعد الذكي"
      >
        <Sparkles className="w-6 h-6" />
      </button>

      {/* النافذة المنبثقة */}
      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-black/40 p-0 md:p-4"
          onClick={handleClose}
        >
          <div
            className="bg-white w-full md:max-w-lg md:rounded-2xl rounded-t-2xl shadow-xl
                       max-h-[85vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* الرأس */}
            <div className="flex items-center justify-between px-4 h-14 border-b border-secondary-200 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary-600" />
                <h3 className="font-bold text-secondary-900">المساعد الذكي</h3>
              </div>
              <button
                onClick={handleClose}
                className="p-1.5 rounded-lg hover:bg-secondary-100 text-secondary-500"
                aria-label="إغلاق"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* مربع البحث */}
              <form onSubmit={handleSearch} className="flex gap-2">
                <div className="relative flex-1">
                  <input
                    type="text"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="اسأل سؤالك... مثال: كم المتبقي على الهدف؟"
                    className="input-field pe-9"
                  />
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-secondary-400" />
                </div>
                <button type="submit" className="btn btn-primary flex-shrink-0" disabled={loading}>
                  بحث
                </button>
              </form>

              {/* الأوامر السريعة */}
              <div>
                <p className="text-xs font-medium text-secondary-500 mb-2">أوامر سريعة</p>
                <div className="flex flex-wrap gap-2">
                  {QUICK_COMMANDS.map((cmd) => (
                    <button
                      key={cmd.id}
                      onClick={() => handleQuickCommand(cmd.id)}
                      disabled={loading}
                      className="btn-sm rounded-full bg-secondary-100 text-secondary-700 hover:bg-secondary-200
                                 px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50"
                    >
                      {cmd.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* منطقة النتائج */}
              <div className="min-h-[80px]">
                {loading && (
                  <div className="flex items-center justify-center py-6 text-secondary-400">
                    <Loader2 className="w-5 h-5 animate-spin" />
                  </div>
                )}

                {!loading && answer && (
                  <div className="card bg-primary-50/60 border-primary-100">
                    <p className="font-bold text-primary-700 mb-2">{answer.title}</p>
                    <ul className="space-y-1">
                      {answer.lines.map((line, idx) => (
                        <li key={idx} className="text-sm text-secondary-700 leading-relaxed">
                          {line}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {!loading && !answer && (
                  <p className="text-sm text-secondary-400 text-center py-6">
                    اسأل سؤالًا أو اختر أمرًا سريعًا للبدء
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
