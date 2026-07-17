import { supabase } from '../../../lib/supabase';
import {
  AIProviderConfigRow,
  TestConnectionResponse,
  OpenRouterModelRow,
  OpenRouterStateRow,
  RefreshModelsResponse,
  RetestModelsResponse,
} from '../types';
import { dalRead } from '../../../lib/dataAccessLayer';

// ============================================================
// طبقة الخدمة لصفحة إعدادات الذكاء الاصطناعي
// تتعامل حصرياً مع الجدول والدالة الشغالين فعلياً على قاعدة البيانات:
//   - جدول: ai_provider_configs
//   - دالة (Edge Function): ai-assistant  (action: "test")
// ============================================================

export async function fetchProviders(): Promise<AIProviderConfigRow[]> {
  const result = await dalRead(
    `aiSettings:providers`,
    async () => {
      const { data, error } = await supabase
        .from('ai_provider_configs')
        .select('*')
        .order('priority', { ascending: true });

      if (error) throw error;
      return (data ?? []) as AIProviderConfigRow[];
    },
    { emptyValue: [] as AIProviderConfigRow[] },
  );
  return result.data;
}

export async function toggleProviderActive(providerId: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('ai_provider_configs')
    .update({ is_active: isActive })
    .eq('id', providerId);
  if (error) throw error;
}

export async function updateProviderModel(providerId: string, model: string): Promise<void> {
  const { error } = await supabase
    .from('ai_provider_configs')
    .update({ model })
    .eq('id', providerId);
  if (error) throw error;
}

export async function reorderProviders(orderedIds: string[]): Promise<void> {
  await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from('ai_provider_configs').update({ priority: index + 1 }).eq('id', id),
    ),
  );
}

export async function testProviderConnection(providerId: string): Promise<TestConnectionResponse> {
  const { data, error } = await supabase.functions.invoke('ai-assistant', {
    body: { action: 'test', providerId },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as TestConnectionResponse;
}

// ============================================================
// OpenRouter — مدير النماذج المجانية الديناميكي
// القراءة والتفضيل/الاستبعاد تتم مباشرة على الجدول (RLS: super_admin فقط)،
// أما التحديث الفوري وإعادة الاختبار الجماعي فتمر عبر ai-assistant Edge Function
// ============================================================

export async function fetchOpenRouterModels(): Promise<OpenRouterModelRow[]> {
  const result = await dalRead(
    `aiSettings:openRouterModels`,
    async () => {
      const { data, error } = await supabase
        .from('ai_openrouter_models')
        .select('*')
        .order('is_preferred', { ascending: false })
        .order('success_count', { ascending: false });
      if (error) throw error;
      return (data ?? []) as OpenRouterModelRow[];
    },
    { emptyValue: [] as OpenRouterModelRow[] },
  );
  return result.data;
}

export async function fetchOpenRouterState(): Promise<OpenRouterStateRow | null> {
  const result = await dalRead(
    `aiSettings:openRouterState`,
    async () => {
      const { data, error } = await supabase
        .from('ai_openrouter_state')
        .select('*')
        .eq('id', true)
        .maybeSingle();
      if (error) throw error;
      return (data as OpenRouterStateRow) ?? null;
    },
    { emptyValue: null as OpenRouterStateRow | null },
  );
  return result.data;
}

export async function toggleOpenRouterModelExcluded(modelId: string, excluded: boolean): Promise<void> {
  const { error } = await supabase
    .from('ai_openrouter_models')
    .update({ is_excluded: excluded })
    .eq('id', modelId);
  if (error) throw error;
}

// تفضيل نموذج معيّن يلغي تفضيل أي نموذج آخر تلقائياً (تفضيل واحد فقط في المرة)
export async function setOpenRouterPreferredModel(modelId: string, preferred: boolean): Promise<void> {
  if (preferred) {
    const { error: clearErr } = await supabase
      .from('ai_openrouter_models')
      .update({ is_preferred: false })
      .eq('is_preferred', true);
    if (clearErr) throw clearErr;
  }
  const { error } = await supabase
    .from('ai_openrouter_models')
    .update({ is_preferred: preferred })
    .eq('id', modelId);
  if (error) throw error;
}

export async function refreshOpenRouterModels(): Promise<RefreshModelsResponse> {
  const { data, error } = await supabase.functions.invoke('ai-assistant', {
    body: { action: 'refresh_openrouter_models' },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as RefreshModelsResponse;
}

export async function retestOpenRouterModels(): Promise<RetestModelsResponse> {
  const { data, error } = await supabase.functions.invoke('ai-assistant', {
    body: { action: 'retest_openrouter_models' },
  });
  if (error) throw error;
  if (data?.error) throw new Error(data.error);
  return data as RetestModelsResponse;
}
