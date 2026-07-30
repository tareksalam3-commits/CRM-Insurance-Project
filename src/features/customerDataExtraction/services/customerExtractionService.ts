// خدمة استخراج بيانات العميل من صورة/مستند باستخدام منظومة الذكاء
// الاصطناعي المركزية (askAI من src/lib/ai/aiManager.ts — نفس منظومة
// المرحلة الأولى، بدون أي منطق اتصال جديد خارجها).
//
// لا يوجد OCR تقليدي هنا: النموذج نفسه يحلل الصورة بصرياً ويُطالَب صراحة
// بالاقتصار على الحقول الممرَّرة له فقط (المُكتشَفة ديناميكياً من النموذج
// الحالي)، وبعدم تخمين أي قيمة غير موجودة، وبتحديد مستوى ثقة لكل قيمة.

import { askAI, type AIContentPart } from '../../../lib/ai/aiManager';
import type { DetectedFormField, ExtractionResult, FieldConfidence } from '../types';

function describeField(field: DetectedFormField): string {
  let line = `- ${field.name} (${field.label})`;
  if (field.inputType === 'select' && field.options?.length) {
    line += ` — القيم المسموحة فقط: ${field.options.map((o) => `${o.value}="${o.label}"`).join(' | ')}`;
  } else if (field.inputType === 'date') {
    line += ' — التاريخ بصيغة YYYY-MM-DD فقط';
  } else if (field.inputType === 'number') {
    line += ' — رقم فقط، بدون فواصل أو رموز أو نص';
  }
  return line;
}

const SYSTEM_PROMPT = `أنت مساعد يحلل صورة مستند (بطاقة رقم قومي، استمارة، أو أي مستند مشابه) بصرياً ويستخرج منه فقط قيم حقول محددة مسبقاً، لملء نموذج "إضافة عميل" داخل نظام CRM لشركة تأمين.

قواعد إلزامية يجب الالتزام بها بدقة:
1. استخرج فقط قيم الحقول المذكورة فى قائمة "الحقول المطلوبة" أدناه. تجاهل تماماً أي معلومة أخرى موجودة فى المستند وغير مطلوبة، ولا تقم بأي استخراج عام (لا تُرجع كل النصوص الموجودة فى المستند).
2. إذا لم تجد قيمة واضحة لحقل معين داخل المستند، لا تُدرج هذا الحقل فى الناتج نهائياً، ولا تخترع أو تخمّن قيمة افتراضية له.
3. لكل قيمة تستخرجها حدد مستوى ثقة: "high" إذا كانت القيمة واضحة ومؤكدة من المستند، أو "low" إذا كانت غير واضحة تماماً أو استنتجتها بشكل غير مباشر.
4. للحقول من نوع select التزم فقط بإحدى القيم (value) المذكورة أمامها، ولا تُرجع التسمية (label) كقيمة.
5. رد بصيغة JSON فقط، بدون أي نص أو شرح قبله أو بعده وبدون Markdown، بالشكل التالي بالضبط:
{"fields": {"اسم_الحقل": {"value": "القيمة", "confidence": "high"}}}`;

/** يستخرج فقط قيم الحقول الممرَّرة من صورة/صور المستند المختار، عبر منظومة الذكاء الاصطناعي المركزية */
export async function extractCustomerDataFromDocument(
  images: string[],
  fields: DetectedFormField[]
): Promise<ExtractionResult> {
  if (images.length === 0) {
    throw new Error('لم يتم اختيار أي صورة أو مستند');
  }
  if (fields.length === 0) {
    throw new Error('تعذر التعرف على حقول نموذج العميل الحالي');
  }

  const userContent: AIContentPart[] = [
    { type: 'text', text: `الحقول المطلوبة فقط:\n${fields.map(describeField).join('\n')}` },
    ...images.map((url): AIContentPart => ({ type: 'image_url', image_url: { url } })),
  ];

  const result = await askAI(
    [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: userContent },
    ],
    { maxTokens: 1500, temperature: 0.1 }
  );

  if (!result.success || !result.content) {
    throw new Error(result.error || 'تعذر الاتصال بمنظومة الذكاء الاصطناعي حالياً، حاول مرة أخرى لاحقاً');
  }

  return sanitizeAgainstSchema(parseExtractionResponse(result.content), fields);
}

interface RawExtractionResponse {
  fields?: Record<string, { value?: unknown; confidence?: unknown }>;
}

function parseExtractionResponse(raw: string): RawExtractionResponse {
  const cleaned = raw.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  try {
    const data = JSON.parse(cleaned) as RawExtractionResponse;
    if (!data || typeof data !== 'object' || typeof data.fields !== 'object' || data.fields === null) {
      throw new Error('shape');
    }
    return data;
  } catch {
    throw new Error('تعذر فهم استجابة الذكاء الاصطناعي، حاول مرة أخرى');
  }
}

/** يتجاهل أي حقل غير معروف أو قيمة غير متوافقة مع نوع الحقل الفعلي، حتى لو أخطأ النموذج فى الرد */
function sanitizeAgainstSchema(parsed: RawExtractionResponse, fields: DetectedFormField[]): ExtractionResult {
  const byName = new Map(fields.map((f) => [f.name, f]));
  const out: ExtractionResult['fields'] = {};

  for (const [name, raw] of Object.entries(parsed.fields || {})) {
    const schema = byName.get(name);
    if (!schema || raw == null) continue;

    let value = typeof raw.value === 'string' ? raw.value.trim() : String(raw.value ?? '').trim();
    if (!value) continue;

    const confidence: FieldConfidence = raw.confidence === 'high' ? 'high' : 'low';

    if (schema.inputType === 'number') {
      const num = Number(value.replace(/[^\d.-]/g, ''));
      if (Number.isNaN(num)) continue;
      value = String(num);
    } else if (schema.inputType === 'date') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) continue;
    } else if (schema.inputType === 'select') {
      const match = schema.options?.find((o) => o.value === value) || schema.options?.find((o) => o.label === value);
      if (!match) continue;
      value = match.value;
    }

    out[name] = { value, confidence };
  }

  return { fields: out };
}
