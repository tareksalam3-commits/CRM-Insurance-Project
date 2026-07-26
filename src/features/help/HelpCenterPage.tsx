import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Printer, PlayCircle, ChevronDown } from 'lucide-react';
import { PageHeader } from '../../components/layout/PageHeader';
import { HELP_REGISTRY, searchHelp } from './content';
import { GUIDE_INTRO, GUIDE_LOGIN, GUIDE_ROLES, GUIDE_WORKFLOW, BEST_PRACTICES, USAGE_TIPS, FAQ_ITEMS } from './guideContent';
import { QUICK_START_STEPS } from './quickStartContent';
import { PrintableGuide } from './PrintableGuide';
import { useHelp } from './HelpContext';

function CollapsibleFaq({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border border-secondary-100 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between p-3 text-sm font-medium text-secondary-900 hover:bg-secondary-50"
      >
        {question}
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && <div className="p-3 pt-0 text-sm text-secondary-600">{answer}</div>}
    </div>
  );
}

export default function HelpCenterPage() {
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { startTour } = useHelp();
  const results = query.trim() ? searchHelp(query) : [];

  return (
    <div className="space-y-6 pb-10">
      <PageHeader
        title="دليل المستخدم"
        subtitle="كل ما تحتاج معرفته لاستخدام النظام بالكامل دون الحاجة لأي تدريب"
        action={
          <div className="flex gap-2">
            <button onClick={startTour} className="btn-secondary flex items-center gap-1.5 text-sm">
              <PlayCircle className="w-4 h-4" /> إعادة الجولة التعريفية
            </button>
            <button onClick={() => window.print()} className="btn-primary flex items-center gap-1.5 text-sm">
              <Printer className="w-4 h-4" /> طباعة / تنزيل PDF
            </button>
          </div>
        }
      />

      {/* محرك البحث */}
      <div className="card p-4 print:hidden">
        <div className="relative">
          <Search className="w-4 h-4 text-secondary-400 absolute right-3 top-1/2 -translate-y-1/2" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="اكتب اسم أي صفحة أو زر أو ميزة..."
            className="input-field w-full pr-9"
          />
        </div>
        {query.trim() && (
          <ul className="mt-3 space-y-2">
            {results.length === 0 && <p className="text-sm text-secondary-500">لا توجد نتائج مطابقة.</p>}
            {results.map((r, i) => (
              <li key={i}>
                <button
                  onClick={() => navigate(r.content.path.replace(/:.*/, ''))}
                  className="w-full text-right p-3 rounded-lg bg-secondary-50 hover:bg-secondary-100"
                >
                  <span className="text-sm font-medium text-secondary-900">{r.content.title}</span>
                  <span className="text-xs text-secondary-500 block mt-0.5">تطابق فى: {r.matchedIn} — {r.snippet}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {!query.trim() && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 print:hidden">
          <section className="card p-5">
            <h3 className="font-semibold text-secondary-900 mb-2">{GUIDE_INTRO.title}</h3>
            {GUIDE_INTRO.paragraphs.map((p, i) => <p key={i} className="text-sm text-secondary-600 mb-2">{p}</p>)}
          </section>

          <section className="card p-5">
            <h3 className="font-semibold text-secondary-900 mb-2">{GUIDE_LOGIN.title}</h3>
            {GUIDE_LOGIN.paragraphs.map((p, i) => <p key={i} className="text-sm text-secondary-600 mb-2">{p}</p>)}
          </section>

          <section className="card p-5 lg:col-span-2">
            <h3 className="font-semibold text-secondary-900 mb-2">{GUIDE_ROLES.title}</h3>
            <p className="text-sm text-secondary-600 mb-3">{GUIDE_ROLES.intro}</p>
            <div className="space-y-2 mb-3">
              {GUIDE_ROLES.roles.map((r) => (
                <div key={r.level} className="flex gap-3 items-start bg-secondary-50 rounded-lg p-2.5">
                  <span className="badge-success text-xs flex-shrink-0">مستوى {r.level}</span>
                  <div>
                    <p className="text-sm font-medium text-secondary-900">{r.label}</p>
                    <p className="text-xs text-secondary-600">{r.description}</p>
                  </div>
                </div>
              ))}
            </div>
            <h4 className="text-sm font-semibold text-secondary-900 mb-1">{GUIDE_ROLES.notesTitle}</h4>
            <ul className="list-disc pr-5 text-sm text-secondary-600 space-y-1">
              {GUIDE_ROLES.notes.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </section>

          <section className="card p-5 lg:col-span-2">
            <h3 className="font-semibold text-secondary-900 mb-3">{GUIDE_WORKFLOW.title}</h3>
            <ol className="space-y-2">
              {GUIDE_WORKFLOW.steps.map((s) => (
                <li key={s.step} className="flex gap-3 text-sm">
                  <span className="w-6 h-6 rounded-full bg-primary-100 text-primary-700 flex items-center justify-center flex-shrink-0 text-xs font-semibold">{s.step}</span>
                  <div><span className="font-medium text-secondary-900">{s.title}: </span><span className="text-secondary-600">{s.description}</span></div>
                </li>
              ))}
            </ol>
          </section>

          <section className="card p-5">
            <h3 className="font-semibold text-secondary-900 mb-3">دليل الاستخدام المختصر (5 دقائق)</h3>
            <ol className="space-y-2">
              {QUICK_START_STEPS.map((s) => (
                <li key={s.title}>
                  <button onClick={() => navigate(s.path)} className="text-right w-full text-sm hover:bg-secondary-50 rounded-lg p-2 -m-2">
                    <span className="font-medium text-secondary-900">{s.title}: </span>
                    <span className="text-secondary-600">{s.description}</span>
                  </button>
                </li>
              ))}
            </ol>
          </section>

          <section className="card p-5">
            <h3 className="font-semibold text-secondary-900 mb-3">أفضل الممارسات</h3>
            <ul className="list-disc pr-5 text-sm text-secondary-600 space-y-1.5">
              {BEST_PRACTICES.map((b, i) => <li key={i}>{b}</li>)}
            </ul>
          </section>

          <section className="card p-5">
            <h3 className="font-semibold text-secondary-900 mb-3">نصائح الاستخدام</h3>
            <ul className="list-disc pr-5 text-sm text-secondary-600 space-y-1.5">
              {USAGE_TIPS.map((t, i) => <li key={i}>{t}</li>)}
            </ul>
          </section>

          <section className="card p-5">
            <h3 className="font-semibold text-secondary-900 mb-3">شرح جميع الصفحات</h3>
            <ul className="space-y-1.5">
              {HELP_REGISTRY.map((h) => (
                <li key={h.path}>
                  <button onClick={() => navigate(h.path.replace(/:.*/, ''))} className="text-sm text-primary-600 hover:underline">
                    {h.title}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="card p-5 lg:col-span-2">
            <h3 className="font-semibold text-secondary-900 mb-3">الأسئلة الشائعة</h3>
            <div className="space-y-2">
              {FAQ_ITEMS.map((f, i) => <CollapsibleFaq key={i} question={f.question} answer={f.answer} />)}
            </div>
          </section>
        </div>
      )}

      {/* نسخة الطباعة/PDF الكاملة — مخفية على الشاشة، تظهر فقط عند الطباعة */}
      <PrintableGuide />
    </div>
  );
}
