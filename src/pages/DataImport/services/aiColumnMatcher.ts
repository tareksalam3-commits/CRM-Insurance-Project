// ===================================================================
// طبقة تحسين اختيارية (Layer 2) فوق نظام الاستيراد الحالي — مطابقة أعمدة
// الملف المرفوع بحقول النظام باستخدام الذكاء الاصطناعي، لملفات لا تطابق
// نموذج الاستيراد الرسمي حرفياً (أسماء أعمدة مختلفة، ترتيب مختلف...).
//
// تُستدعى فقط لما تفشل المطابقة الحرفية الصارمة (Layer 1) — لا تُستخدم
// نهائياً على الملفات المطابقة للنموذج بالضبط، وأي فشل أو استثناء هنا
// (AI معطّل، لا يوجد مزود، انتهاء توكنز، خطأ شبكة، رد غير صالح...) يُرجع
// ببساطة null، ليرجع المستدعي تلقائياً لنفس سلوك/رسائل النظام الحالي
// القديمة تماماً دون أي تأثير على عملية الاستيراد.
//
// تعتمد على منظومة الذكاء الاصطناعي المركزية الموجودة بالفعل (askAI فى
// src/lib/ai/aiManager) — لا يوجد أي استدعاء مباشر لمزود خدمة هنا.
// ===================================================================

import { askAI } from '../../../lib/ai/aiManager';
import { IMPORT_COLUMNS, type ImportColumnKey } from '../types';

export const FIELD_DESCRIPTIONS: Record<ImportColumnKey, string> = {
  customer_name: 'اسم العميل الكامل',
  national_id: 'الرقم القومي للعميل (14 رقم)',
  phone: 'رقم هاتف العميل',
  address: 'عنوان سكن العميل',
  birth_date: 'تاريخ ميلاد العميل',
  occupation: 'مهنة العميل',
  marital_status: 'الحالة الاجتماعية للعميل',
  agent_name: 'اسم الوكيل المسؤول عن العميل داخل الشركة',
  policy_number: 'رقم وثيقة التأمين',
  policy_type: 'نوع وثيقة التأمين',
  sum_assured: 'مبلغ التأمين (رأس المال المؤمَّن عليه)',
  premium_amount: 'قيمة القسط الصافي الذي يدفعه العميل بشكل دوري',
  payment_method: 'طريقة سداد القسط',
  start_date: 'تاريخ بداية سريان التأمين',
  notes: 'ملاحظات إضافية عن العميل أو الوثيقة',
};

function buildSystemPrompt(): string {
  const fieldsList = IMPORT_COLUMNS.map(
    (c) => `- ${c.key}: ${FIELD_DESCRIPTIONS[c.key]}${c.required ? ' (إلزامي)' : ' (اختياري)'}`
  ).join('\n');

  return `أنت مساعد يطابق أعمدة ملف بيانات (Excel/CSV) رفعه مستخدم، بحقول نظام CRM لشركة تأمين، بغرض استيراد بيانات عملاء ووثائق تأمين.

حقول النظام المطلوب مطابقتها:
${fieldsList}

سيتم تزويدك بقائمة أسماء الأعمدة الموجودة فعلياً فى الملف المرفوع، مع عيّنة من قيم كل عمود لمساعدتك على فهم معناه الحقيقي.

قواعد إلزامية يجب الالتزام بها بدقة:
1. لكل حقل من حقول النظام أعلاه، اختر اسم العمود الأنسب له من أعمدة الملف، بناءً على معنى العمود وقيمه الفعلية وليس فقط تشابه الاسم الحرفي. مثال: "Client Name" أو "Full Name" أو "اسم العميل" أو "العميل" كلها قد تطابق نفس الحقل customer_name.
2. انسخ اسم العمود المُختار حرفياً تماماً كما ورد فى قائمة أعمدة الملف أدناه، بدون أي تعديل أو إضافة رموز.
3. إذا لم يوجد عمود مناسب لحقل معين فى الملف، ضع القيمة null لهذا الحقل. لا تخترع أبداً اسم عمود غير موجود فعلياً فى القائمة.
4. كل عمود من أعمدة الملف يُستخدم لحقل واحد فقط كحد أقصى، لا تكرر نفس اسم العمود لأكثر من حقل.
5. رد بصيغة JSON فقط، بدون أي نص أو شرح قبله أو بعده وبدون Markdown، بالشكل التالي بالضبط وبنفس المفاتيح لكل الحقول المذكورة أعلاه:
{"mapping": {"customer_name": "اسم العمود أو null", "national_id": "اسم العمود أو null"}}`;
}

function describeFileColumns(fileHeaders: string[], sampleRows: any[][]): string {
  return fileHeaders
    .map((h, idx) => {
      const samples = sampleRows
        .map((r) => r?.[idx])
        .filter((v) => v !== undefined && v !== null && String(v).trim() !== '')
        .slice(0, 3)
        .map((v) => String(v).trim());
      return `${idx + 1}. "${h}"${samples.length ? ` — أمثلة من البيانات: ${samples.join('، ')}` : ''}`;
    })
    .join('\n');
}

interface RawMappingResponse {
  mapping?: Record<string, unknown>;
}

function parseMappingResponse(raw: string): RawMappingResponse {
  const cleaned = raw.trim().replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
  const data = JSON.parse(cleaned);
  if (!data || typeof data !== 'object' || typeof data.mapping !== 'object' || data.mapping === null) {
    throw new Error('shape');
  }
  return data as RawMappingResponse;
}

/**
 * يحاول مطابقة أعمدة الملف المرفوع (fileHeaders) بحقول النظام باستخدام
 * الذكاء الاصطناعي. يُرجع خريطة (حقل النظام → اسم عمود فعلي من الملف)
 * بعد التحقق من أن كل اسم عمود مُرجَع موجود فعلاً وبنفس الحروف فى
 * fileHeaders (تجاهل أي اسم مُختلَق أو مكرر)، أو null فى أي حالة فشل.
 */
export async function matchColumnsWithAI(
  fileHeaders: string[],
  sampleRows: any[][]
): Promise<Partial<Record<ImportColumnKey, string>> | null> {
  try {
    if (fileHeaders.length === 0) return null;

    const result = await askAI(
      [
        { role: 'system', content: buildSystemPrompt() },
        { role: 'user', content: `أعمدة الملف المرفوع:\n${describeFileColumns(fileHeaders, sampleRows)}` },
      ],
      { maxTokens: 800, temperature: 0.1 }
    );

    if (!result.success || !result.content) return null;

    const parsed = parseMappingResponse(result.content);
    const validHeaders = new Set(fileHeaders);
    const usedHeaders = new Set<string>();
    const mapping: Partial<Record<ImportColumnKey, string>> = {};

    for (const col of IMPORT_COLUMNS) {
      const value = parsed.mapping?.[col.key];
      if (typeof value !== 'string') continue;
      const header = value.trim();
      if (!header || header.toLowerCase() === 'null') continue;
      if (!validHeaders.has(header) || usedHeaders.has(header)) continue; // تجاهل أي اسم عمود مُختلَق أو مكرر
      mapping[col.key] = header;
      usedHeaders.add(header);
    }

    return mapping;
  } catch {
    return null; // أي خطأ (شبكة، JSON غير صالح، استثناء غير متوقع...) → رجوع صامت للنظام الحالي
  }
}
