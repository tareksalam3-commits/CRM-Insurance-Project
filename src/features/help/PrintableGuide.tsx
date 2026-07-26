import { GUIDE_INTRO, GUIDE_LOGIN, GUIDE_ROLES, GUIDE_WORKFLOW, BEST_PRACTICES, USAGE_TIPS, FAQ_ITEMS } from './guideContent';
import { QUICK_START_STEPS } from './quickStartContent';

/**
 * نسخة الطباعة/PDF الكاملة من دليل المستخدم. مخفية دائماً على الشاشة
 * (hidden print:block) وتظهر فقط عند استدعاء window.print()، بنفس أسلوب
 * تقارير الطباعة الأخرى فى المشروع (مثال: PriceCalculator, Reports) —
 * وذلك لتفادي مشاكل عرض الخط العربي المعروفة فى مكتبة jsPDF.
 * يمكن للمستخدم من نافذة الطباعة اختيار "حفظ كـ PDF" للحصول على نسخة PDF.
 * يُعاد بناء هذا المحتوى تلقائياً من نفس مصدر الدليل الظاهر داخل التطبيق
 * (ملفات guideContent/quickStartContent)، لذلك أي تحديث على
 * محتوى المساعدة ينعكس تلقائياً هنا أيضاً دون أي خطوة إضافية.
 */
export function PrintableGuide() {
  const today = new Date().toLocaleDateString('ar-EG');

  return (
    <div className="hidden print:block p-8" dir="rtl">
      <div className="text-center mb-8 border-b pb-4">
        <h1 className="text-2xl font-bold">دليل المستخدم — نظام إدارة أعمال التأمين</h1>
        <p className="text-sm text-secondary-500 mt-1">نسخة بتاريخ {today}</p>
      </div>

      <h2 className="text-lg font-bold mt-6 mb-2">{GUIDE_INTRO.title}</h2>
      {GUIDE_INTRO.paragraphs.map((p, i) => <p key={i} className="text-sm mb-2">{p}</p>)}

      <h2 className="text-lg font-bold mt-6 mb-2">{GUIDE_LOGIN.title}</h2>
      {GUIDE_LOGIN.paragraphs.map((p, i) => <p key={i} className="text-sm mb-2">{p}</p>)}

      <h2 className="text-lg font-bold mt-6 mb-2">{GUIDE_ROLES.title}</h2>
      <p className="text-sm mb-2">{GUIDE_ROLES.intro}</p>
      <table className="w-full text-sm border-collapse mb-3">
        <thead><tr className="border-b"><th className="text-right py-1">المستوى</th><th className="text-right py-1">الدور</th><th className="text-right py-1">الوصف</th></tr></thead>
        <tbody>
          {GUIDE_ROLES.roles.map((r) => (
            <tr key={r.level} className="border-b">
              <td className="py-1 align-top">{r.level}</td>
              <td className="py-1 align-top font-medium">{r.label}</td>
              <td className="py-1 align-top">{r.description}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <ul className="list-disc pr-5 text-sm space-y-1 mb-2">
        {GUIDE_ROLES.notes.map((n, i) => <li key={i}>{n}</li>)}
      </ul>

      <h2 className="text-lg font-bold mt-6 mb-2">{GUIDE_WORKFLOW.title}</h2>
      <ol className="list-decimal pr-5 text-sm space-y-1 mb-2">
        {GUIDE_WORKFLOW.steps.map((s) => <li key={s.step}><span className="font-medium">{s.title}: </span>{s.description}</li>)}
      </ol>

      <h2 className="text-lg font-bold mt-6 mb-2">دليل الاستخدام المختصر (5 دقائق)</h2>
      <ol className="list-decimal pr-5 text-sm space-y-1 mb-2">
        {QUICK_START_STEPS.map((s) => <li key={s.title}><span className="font-medium">{s.title}: </span>{s.description}</li>)}
      </ol>

      <h2 className="text-lg font-bold mt-6 mb-2" style={{ pageBreakBefore: 'always' }}>الأسئلة الشائعة</h2>
      {FAQ_ITEMS.map((f, i) => (
        <div key={i} className="mb-2 text-sm">
          <p className="font-medium">س: {f.question}</p>
          <p>ج: {f.answer}</p>
        </div>
      ))}

      <h2 className="text-lg font-bold mt-6 mb-2">أفضل الممارسات</h2>
      <ul className="list-disc pr-5 text-sm space-y-1 mb-2">{BEST_PRACTICES.map((b, i) => <li key={i}>{b}</li>)}</ul>

      <h2 className="text-lg font-bold mt-6 mb-2">نصائح الاستخدام</h2>
      <ul className="list-disc pr-5 text-sm space-y-1">{USAGE_TIPS.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </div>
  );
}
