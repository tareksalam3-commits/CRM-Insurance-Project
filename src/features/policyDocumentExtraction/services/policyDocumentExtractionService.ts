// خدمة استخراج بيانات وثيقة التأمين من صورة/مستند باستخدام منظومة الذكاء
// الاصطناعي المركزية (المحرك العام src/lib/ai/formExtractionEngine.ts —
// نفس المحرك المستخرَج من منظومة المرحلة الأولى/الثانية، بدون أي منطق
// تحليل أو تحقق مكرر هنا). كل ما تفعله هذه الخدمة هو تمرير سياق الشاشة
// الحالية (نموذج إصدار وثيقة تأمين) للمحرك العام.

import { extractFormDataFromDocument } from '../../../lib/ai/formExtractionEngine';
import type { DetectedFormField, ExtractionResult } from '../../customerDataExtraction/types';

/** يستخرج فقط قيم حقول نموذج "إصدار وثيقة تأمين" الممرَّرة، من صورة/صور المستند المختار */
export function extractPolicyDataFromDocument(
  images: string[],
  fields: DetectedFormField[]
): Promise<ExtractionResult> {
  return extractFormDataFromDocument(images, fields, {
    formPurpose: 'نموذج "إصدار وثيقة تأمين"',
  });
}
