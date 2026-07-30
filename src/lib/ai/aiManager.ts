import { supabase } from '../supabase';

// ============================================================================
// منظومة الذكاء الاصطناعي المركزية — نقطة الدخول الوحيدة لأي ميزة (حالية أو
// مستقبلية) تحتاج استخدام الذكاء الاصطناعي داخل التطبيق.
//
// لا تستخدم أي مزود خدمة مباشرة من أي صفحة أو مكوّن؛ استورد askAI من هنا
// فقط. هذا يضمن أن اختيار المزود/النموذج والتبديل التلقائي عند الخطأ يتم
// فى مكان واحد (Edge Function: ai-gateway)، ولا تتكرر هذه المنطق فى كل ميزة.
//
// المحتوى (content) يدعم نصاً بسيطاً أو مصفوفة أجزاء (نص + صور) لتحليل
// المستندات/الصور بصرياً — تُستخدم حالياً فى ميزة "استخراج البيانات" بصفحة
// إضافة عميل (src/features/customerDataExtraction).
// ============================================================================

export type AIContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } };

export interface AIChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string | AIContentPart[];
}

export interface AskAIOptions {
  maxTokens?: number;
  temperature?: number;
}

export interface AskAIResult {
  success: boolean;
  provider?: string;
  model?: string;
  content?: string;
  error?: string;
}

export async function askAI(messages: AIChatMessage[], options: AskAIOptions = {}): Promise<AskAIResult> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) {
    return { success: false, error: 'لا توجد جلسة نشطة' };
  }

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  try {
    const res = await fetch(`${supabaseUrl}/functions/v1/ai-gateway`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        messages,
        max_tokens: options.maxTokens ?? 512,
        temperature: options.temperature ?? 0.7,
      }),
    });
    const result = await res.json();
    return result as AskAIResult;
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'خطأ غير متوقع' };
  }
}
