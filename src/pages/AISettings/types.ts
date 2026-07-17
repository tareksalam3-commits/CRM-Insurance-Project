// ============================================================
// أنواع بيانات صفحة إعدادات الذكاء الاصطناعي
// تتطابق تماماً مع الجدول الفعلي الشغال على قاعدة البيانات:
// ai_provider_configs (ميجريشن 035_replace_ai_providers_with_free_ones)
// مزود واحد = صف واحد = Secret واحد (لا يوجد مفاتيح متعددة لكل مزود)
// ============================================================

export type AIProviderKey = 'openrouter' | 'groq' | 'cerebras' | 'nvidia_nim' | 'zai' | 'mistral';

export type AITestStatus = 'connected' | 'error' | 'untested';

export interface AIProviderConfigRow {
  id: string;
  provider: AIProviderKey;
  display_name: string;
  secret_name: string;
  model: string;
  is_active: boolean;
  priority: number;
  last_tested_at: string | null;
  last_test_status: AITestStatus;
  last_test_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface TestConnectionResponse {
  status: AITestStatus;
  message: string;
}

// ============================================================
// OpenRouter — مدير النماذج المجانية الديناميكي
// تتطابق تماماً مع الجداول الفعلية: ai_openrouter_models / ai_openrouter_state
// ============================================================

export interface OpenRouterModelRow {
  id: string; // معرّف النموذج في OpenRouter، مثال: meta-llama/llama-3.1-8b-instruct:free
  name: string | null;
  context_length: number | null;
  is_excluded: boolean;
  is_preferred: boolean;
  success_count: number;
  failure_count: number;
  consecutive_failures: number;
  avg_latency_ms: number | null;
  last_success_at: string | null;
  last_failure_at: string | null;
  last_failure_reason: string | null;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface OpenRouterStateRow {
  id: boolean; // صف واحد فقط (Singleton) بقيمة true
  current_model: string | null;
  last_models_refresh_at: string | null;
  last_health_check_at: string | null;
  total_models_count: number;
  status: string;
  last_error: string | null;
  updated_at: string;
}

export interface RefreshModelsResponse {
  count: number;
}

export interface RetestModelsResponse {
  tested: number;
  succeeded: number;
  failed: number;
}
