import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Search, BookOpen, AlertCircle, HelpCircle as HelpIcon } from 'lucide-react';
import clsx from 'clsx';
import { useHelp } from './HelpContext';
import { searchHelp } from './content';
import type { HelpItem, HelpMessageItem, HelpErrorItem } from './types';

function Section({ title, items }: { title: string; items?: HelpItem[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-4">
      <h4 className="text-sm font-semibold text-secondary-900 mb-2">{title}</h4>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="text-sm bg-secondary-50 rounded-lg p-2.5">
            <span className="font-medium text-secondary-800">{item.label}</span>
            <p className="text-secondary-600 mt-0.5">{item.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MessagesSection({ items }: { items?: HelpMessageItem[] }) {
  if (!items || items.length === 0) return null;
  const colorFor = (k?: HelpMessageItem['kind']) => ({
    success: 'bg-success-50 text-success-700',
    error: 'bg-error-50 text-error-700',
    warning: 'bg-warning-50 text-warning-700',
    confirm: 'bg-info-50 text-info-700',
    info: 'bg-secondary-50 text-secondary-700',
  }[k || 'info']);
  return (
    <div className="mb-4">
      <h4 className="text-sm font-semibold text-secondary-900 mb-2">الرسائل والتنبيهات</h4>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className={clsx('text-sm rounded-lg p-2.5', colorFor(item.kind))}>
            <span className="font-medium">{item.label}</span>
            <p className="mt-0.5 opacity-90">{item.description}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ErrorsSection({ items }: { items?: HelpErrorItem[] }) {
  if (!items || items.length === 0) return null;
  return (
    <div className="mb-4">
      <h4 className="text-sm font-semibold text-secondary-900 mb-2 flex items-center gap-1.5">
        <AlertCircle className="w-4 h-4 text-error-500" /> الأخطاء المحتملة وطريقة حلها
      </h4>
      <ul className="space-y-2">
        {items.map((item, i) => (
          <li key={i} className="text-sm bg-error-50 rounded-lg p-2.5">
            <span className="font-medium text-error-700">{item.label}</span>
            <p className="text-error-600 mt-0.5">{item.description}</p>
            <p className="text-secondary-700 mt-1"><span className="font-medium">الحل: </span>{item.resolution}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function HelpPanel() {
  const { isPanelOpen, closePanel, currentPageHelp } = useHelp();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');

  if (!isPanelOpen) return null;

  const results = query.trim() ? searchHelp(query) : [];

  return (
    <div className="modal-overlay" onClick={closePanel}>
      <div
        className="modal-content sm:max-w-md sm:h-full sm:!rounded-none sm:!my-0 sm:mr-0 sm:ml-auto flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-secondary-100 flex-shrink-0">
          <div className="flex items-center gap-2">
            <HelpIcon className="w-5 h-5 text-primary-600" />
            <h3 className="font-semibold text-secondary-900">
              {currentPageHelp ? `مساعدة: ${currentPageHelp.title}` : 'مركز المساعدة'}
            </h3>
          </div>
          <button onClick={closePanel} className="p-1.5 rounded-lg hover:bg-secondary-100">
            <X className="w-4 h-4 text-secondary-600" />
          </button>
        </div>

        <div className="p-3 border-b border-secondary-100 flex-shrink-0">
          <div className="relative">
            <Search className="w-4 h-4 text-secondary-400 absolute right-3 top-1/2 -translate-y-1/2" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ابحث عن أي صفحة أو زر أو ميزة..."
              className="input-field w-full pr-9 text-sm"
            />
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {query.trim() ? (
            results.length > 0 ? (
              <ul className="space-y-2">
                {results.map((r, i) => (
                  <li key={i}>
                    <button
                      onClick={() => { closePanel(); navigate(r.content.path.replace(/:.*/, '')); }}
                      className="w-full text-right p-3 rounded-lg bg-secondary-50 hover:bg-secondary-100 transition-colors"
                    >
                      <span className="text-sm font-medium text-secondary-900">{r.content.title}</span>
                      <span className="text-xs text-secondary-500 block mt-0.5">تطابق فى: {r.matchedIn} — {r.snippet}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-secondary-500 text-center py-6">لا توجد نتائج مطابقة لبحثك.</p>
            )
          ) : currentPageHelp ? (
            <>
              <p className="text-sm text-secondary-700 mb-1"><span className="font-semibold">الغرض من الصفحة: </span>{currentPageHelp.purpose}</p>
              <p className="text-sm text-secondary-700 mb-4"><span className="font-semibold">متى تُستخدم: </span>{currentPageHelp.whenToUse}</p>
              {currentPageHelp.rolesNote && (
                <p className="text-xs bg-info-50 text-info-700 rounded-lg p-2.5 mb-4">{currentPageHelp.rolesNote}</p>
              )}
              <Section title="الأزرار" items={currentPageHelp.buttons} />
              <Section title="الحقول" items={currentPageHelp.fields} />
              <Section title="الجداول" items={currentPageHelp.tables} />
              <Section title="البطاقات والإحصائيات" items={currentPageHelp.cardsAndStats} />
              <Section title="الفلاتر" items={currentPageHelp.filters} />
              <MessagesSection items={currentPageHelp.messages} />
              <ErrorsSection items={currentPageHelp.errors} />
              {currentPageHelp.notes && currentPageHelp.notes.length > 0 && (
                <div className="mb-2">
                  <h4 className="text-sm font-semibold text-secondary-900 mb-2">ملاحظات</h4>
                  <ul className="list-disc pr-5 space-y-1 text-sm text-secondary-600">
                    {currentPageHelp.notes.map((n, i) => <li key={i}>{n}</li>)}
                  </ul>
                </div>
              )}
            </>
          ) : (
            <p className="text-sm text-secondary-500 text-center py-6">لا يوجد شرح مخصص لهذه الصفحة بعد.</p>
          )}
        </div>

        <div className="p-3 border-t border-secondary-100 flex-shrink-0">
          <button
            onClick={() => { closePanel(); navigate('/help'); }}
            className="btn-secondary w-full flex items-center justify-center gap-2 text-sm"
          >
            <BookOpen className="w-4 h-4" /> فتح دليل المستخدم الكامل
          </button>
        </div>
      </div>
    </div>
  );
}
