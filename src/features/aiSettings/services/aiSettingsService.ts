import { supabase } from '../../../lib/supabase';
import type { AIProviderKey, AISettingsBundle } from '../types';

async function getAccessToken(): Promise<string> {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error('لا توجد جلسة نشطة');
  return accessToken;
}

/** جلب حالة منظومة الذكاء الاصطناعي كاملة (super_admin فقط) */
export async function fetchAISettings(): Promise<AISettingsBundle> {
  const { data, error } = await supabase.rpc('ai_get_settings');
  if (error) throw new Error(error.message || 'فشل تحميل إعدادات الذكاء الاصطناعي');
  return data as AISettingsBundle;
}

/** تفعيل / تعطيل المنظومة بالكامل */
export async function setAIEnabled(enabled: boolean): Promise<void> {
  const { error } = await supabase.rpc('ai_set_enabled', { p_enabled: enabled });
  if (error) throw new Error(error.message || 'فشل تحديث حالة التفعيل');
}

export interface UpdateProviderInput {
  provider: AIProviderKey;
  enabled?: boolean;
  priority?: number;
  /** مرّر فقط لو المستخدم كتب مفتاحاً جديداً فعلياً؛ اترك undefined للإبقاء على المفتاح الحالي */
  apiKey?: string;
  /** مرّر فقط لو المستخدم عدّل الـ Account ID (خاص بـ Cloudflare) */
  accountId?: string;
}

/** تعديل إعدادات مزود واحد (تفعيل/أولوية/مفتاح/Account ID) */
export async function updateProvider(input: UpdateProviderInput): Promise<void> {
  const { error } = await supabase.rpc('ai_upsert_provider', {
    p_provider: input.provider,
    p_enabled: input.enabled ?? null,
    p_priority: input.priority ?? null,
    p_api_key: input.apiKey ?? null,
    p_account_id: input.accountId ?? null,
    p_key_changed: input.apiKey !== undefined,
    p_account_id_changed: input.accountId !== undefined,
  });
  if (error) throw new Error(error.message || 'فشل حفظ إعدادات المزود');
}

export interface TestConnectionResult {
  success: boolean;
  status: 'active' | 'error';
  error?: string;
  models_found?: number;
}

/** اختبار الاتصال بمزود معيّن + تحديث كاش النماذج المجانية المتاحة له (Edge Function) */
export async function testProviderConnection(provider: AIProviderKey): Promise<TestConnectionResult> {
  const accessToken = await getAccessToken();
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  const res = await fetch(`${supabaseUrl}/functions/v1/ai-test-connection`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ provider }),
  });

  const result = await res.json();
  if (!res.ok) {
    throw new Error(result?.error || 'فشل اختبار الاتصال');
  }
  return result as TestConnectionResult;
}
