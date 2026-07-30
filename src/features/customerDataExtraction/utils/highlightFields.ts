// تمييز بصري مؤقت للحقول ذات مستوى الثقة المنخفض بعد الاستخراج التلقائي،
// حتى يراجعها المستخدم بنفسه قبل الحفظ. يُزال التمييز تلقائياً بمجرد أن
// يعدّل المستخدم قيمة الحقل يدوياً.

const HIGHLIGHT_CLASSES = ['border-warning-500', 'ring-1', 'ring-warning-400'];
const REVIEW_TITLE = 'تم استخراج هذه القيمة بثقة منخفضة — يرجى مراجعتها';

export function highlightLowConfidenceFields(formEl: HTMLFormElement, fieldNames: string[]): void {
  fieldNames.forEach((name) => {
    const control = formEl.querySelector<HTMLElement>(`[name="${name}"]`);
    if (!control) return;

    control.classList.add(...HIGHLIGHT_CLASSES);
    control.setAttribute('title', REVIEW_TITLE);

    const clear = () => {
      control.classList.remove(...HIGHLIGHT_CLASSES);
      control.removeAttribute('title');
      control.removeEventListener('input', clear);
      control.removeEventListener('change', clear);
    };
    control.addEventListener('input', clear);
    control.addEventListener('change', clear);
  });
}

/** إزالة أي تمييز سابق قبل بدء عملية استخراج جديدة */
export function clearAllHighlights(formEl: HTMLFormElement): void {
  const controls = formEl.querySelectorAll<HTMLElement>('.form-group input, .form-group select');
  controls.forEach((control) => {
    control.classList.remove(...HIGHLIGHT_CLASSES);
    control.removeAttribute('title');
  });
}
