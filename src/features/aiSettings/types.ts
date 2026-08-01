// أنواع بيانات منظومة إعدادات الذكاء الاصطناعي.
// مطابقة لما تُعيده الدالة ai_get_settings() فى قاعدة البيانات.

export type AIProviderKey = 'openrouter' | 'groq' | 'cloudflare' | 'ocrspace' | 'gemini';

/** نوع المزود: ai لمزودي توليد النصوص/تحليل الصور، ocr لمزودي استخراج
 * النص من الصور/PDF (تُستخدم فقط لتقسيم عرض صفحة الإعدادات لقسمين). */
export type AIProviderType = 'ai' | 'ocr';

export type AIProviderStatus = 'untested' | 'active' | 'error' | 'disabled';

export interface AIProviderConfig {
  provider: AIProviderKey;
  provider_type: AIProviderType;
  display_name: string;
  enabled: boolean;
  priority: number;
  has_key: boolean;
  key_preview: string | null;
  has_account_id: boolean;
  default_model: string | null;
  status: AIProviderStatus;
  last_error: string | null;
  last_tested_at: string | null;
}

export interface AIProviderModel {
  provider: AIProviderKey;
  model_id: string;
  model_name: string | null;
  context_length: number | null;
  fetched_at: string;
}

export interface AISettingsSummary {
  ai_enabled: boolean;
  active_provider: AIProviderKey | null;
  active_model: string | null;
  models_updated_at: string | null;
  updated_at: string;
}

export interface AISettingsBundle {
  settings: AISettingsSummary;
  providers: AIProviderConfig[];
  models: AIProviderModel[];
}

export const AI_PROVIDER_LABELS: Record<AIProviderKey, string> = {
  openrouter: 'OpenRouter',
  groq: 'Groq',
  cloudflare: 'Cloudflare AI',
  ocrspace: 'OCR.Space',
  gemini: 'Gemini (Google AI Studio)'
};

export const AI_PROVIDER_STATUS_LABELS: Record<AIProviderStatus, string> = {
  untested: 'لم يتم الاختبار بعد',
  active: 'متصل ويعمل',
  error: 'به خطأ',
  disabled: 'معطّل'
};
