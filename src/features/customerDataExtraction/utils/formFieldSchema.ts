// استخراج قائمة حقول أي نموذج مباشرة من الـ DOM المعروض فعلياً وقت
// الاستخدام، بدلاً من الاعتماد على قائمة ثابتة داخل كود الذكاء الاصطناعي.
// أي إضافة أو حذف أو تعديل لحقل داخل أي نموذج (نموذج العميل أو غيره)
// ينعكس تلقائياً هنا دون الحاجة لتعديل أي شيء فى منظومة استخراج البيانات.
//
// يعتمد على نمط ".form-group" (تسمية <label> + عنصر إدخال بداخل نفس
// المجموعة) المستخدم بالفعل فى كل حقول نماذج التطبيق.
//
// ملحوظة: تمت إضافة دعم عنصر textarea (بالإضافة إلى input/select الأصليين)
// حتى تُكتشف كل أنواع الحقول الموجودة فعلياً فى أي نموذج (مثل حقل
// "ملاحظات" فى نموذج الوثيقة) — إضافة غير كاسرة، لا تؤثر على أي نموذج لا
// يحتوي على textarea (كنموذج العميل الحالي).

import type { DetectedFormField } from '../types';

type FormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

function isUsableControl(control: FormControl): boolean {
  if (control instanceof HTMLInputElement && control.type === 'hidden') return false;
  return true;
}

/** يقرأ النموذج المعروض حالياً ويستنتج حقوله (الاسم، النوع، التسمية، والقيم المسموحة إن وجدت) */
export function extractFormFieldSchema(formEl: HTMLFormElement): DetectedFormField[] {
  const groups = Array.from(formEl.querySelectorAll<HTMLElement>('.form-group'));
  const fields: DetectedFormField[] = [];

  for (const group of groups) {
    const labelEl = group.querySelector('label');
    const control = group.querySelector<FormControl>('input[name], select[name], textarea[name]');
    if (!labelEl || !control || !control.name) continue;
    if (!isUsableControl(control)) continue;

    const rawLabel = labelEl.textContent?.trim() || control.name;
    const required = rawLabel.includes('*');
    const label = rawLabel.replace('*', '').trim();

    if (control instanceof HTMLSelectElement) {
      const options = Array.from(control.options)
        .filter((o) => o.value !== '')
        .map((o) => ({ value: o.value, label: o.textContent?.trim() || o.value }));
      fields.push({ name: control.name, label, inputType: 'select', required, options });
      continue;
    }

    let inputType: DetectedFormField['inputType'] = 'text';
    if (control.type === 'number') inputType = 'number';
    else if (control.type === 'date') inputType = 'date';

    fields.push({ name: control.name, label, inputType, required });
  }

  return fields;
}
