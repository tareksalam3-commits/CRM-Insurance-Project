import { HelpCircle } from 'lucide-react';
import { useHelp } from './HelpContext';

/**
 * زر (؟) العام — يظهر أعلى كل صفحة (مدمج فى Header.tsx مرة واحدة فقط،
 * وليس داخل كل صفحة على حدة). عند الضغط عليه يفتح شرح الصفحة الحالية
 * فقط، بالاعتماد على المسار (Route) الحالي.
 */
export function HelpButton() {
  const { openPanel, currentPageHelp } = useHelp();

  return (
    <button
      onClick={openPanel}
      data-tour-id="header-help"
      aria-label={currentPageHelp ? `مساعدة صفحة ${currentPageHelp.title}` : 'مساعدة'}
      title="شرح هذه الصفحة"
      className="p-2 rounded-lg hover:bg-secondary-100 text-secondary-600 flex-shrink-0"
    >
      <HelpCircle className="w-5 h-5" />
    </button>
  );
}
