import { supabase } from './supabase';

// ============================================================
// AI Service Layer
// ============================================================
// نقطة الاستدعاء الوحيدة لأي جزء من التطبيق يحتاج ذكاء اصطناعي.
// كل شيء يمر عبر Edge Function الفعلية الشغالة على قاعدة البيانات
// باسم "ai-assistant" (وليس "ai-gateway") — وهي التي تختار المزود
// المناسب من جدول ai_provider_configs وتطبّق Fallback تلقائياً عند
// الفشل. التطبيق لا يعرف ولا يحتاج أن يعرف أي مزود تم استخدامه فعلياً.
// ============================================================

export type AIChatRole = 'user' | 'assistant';

export interface AIChatMessage {
  role: AIChatRole;
  content: string;
}

export interface AskAIResult {
  reply: string;
  provider: string;
}

export class AIServiceError extends Error {
  details?: string;
  constructor(message: string, details?: string) {
    super(message);
    this.name = 'AIServiceError';
    this.details = details;
  }
}

/**
 * إرسال سؤال إلى المساعد الذكي والحصول على رد نصي.
 * اختيار المزود، والـ Fallback عند الفشل، بالكامل من طرف الخادم (ai-assistant).
 */
export async function askAI(params: {
  message: string;
  history?: AIChatMessage[];
  systemContext?: string;
  dataContext?: unknown;
}): Promise<AskAIResult> {
  const { data, error } = await supabase.functions.invoke('ai-assistant', {
    body: { action: 'chat', ...params },
  });

  if (error) {
    throw new AIServiceError('تعذّر الاتصال بخدمة الذكاء الاصطناعي');
  }

  if (data?.error) {
    throw new AIServiceError(data.error, data.details);
  }

  return data as AskAIResult;
}
