// Edge Function: ai-assistant
//
// نقطة الدخول الوحيدة لكل طلبات الذكاء الاصطناعي في النظام.
// التطبيق (Frontend) لا يعرف أي مزود ذكاء اصطناعي يتم استخدامه فعلياً؛
// كل ما يعرفه هو أنه بيبعت سؤال ويستلم رد. اختيار المزود، الترتيب،
// وإعادة المحاولة مع المزود التالي عند الفشل (Fallback) كله بيحصل هنا.
//
// المفاتيح لا تُحفظ أبداً في قاعدة البيانات ولا تُرسل للـ Frontend إطلاقاً؛
// تُقرأ فقط من Supabase Secrets وقت التنفيذ عبر Deno.env.get(secret_name).
//
// ============================================================
// طبقة المزودين (محدَّثة): OpenAI / Gemini / Claude تمت إزالتهم بالكامل (لا
// استخدام لهم فى التطبيق). المزودون المدعومون الآن:
//   1. OpenRouter  (المزود الأساسي دائماً - منطقه أدناه لم يتغيّر إطلاقاً)
//   2. Groq
//   3. Cerebras
//   4. NVIDIA NIM
//   5. Z.ai
//   6. Mistral AI
// الترتيب الفعلي عند التنفيذ يعتمد على عمود priority داخل ai_provider_configs
// (القيم أعلاه هي الترتيب الافتراضي المضبوط فى القاعدة حالياً)، ولا يُستخدم
// أي مزود معطّل (is_active = false) أو بدون مفتاح API مُعرَّف.
// ============================================================
//
// ============================================================
// OpenRouter: مدير نماذج مجانية ديناميكي (لا يعتمد على موديل ثابت)
// ============================================================
// بدل الاعتماد على قيمة عمود "model" الثابتة في ai_provider_configs،
// مزود OpenRouter بيدير تلقائياً كل النماذج المجانية (:free) المتاحة:
//  - جدول ai_openrouter_models: كاش النماذج + إحصاءات نجاح/فشل/زمن استجابة لكل موديل
//  - جدول ai_openrouter_state:  حالة عامة واحدة (Singleton, id=true) — آخر تحديث، الموديل الحالي، الحالة
//  - refresh_openrouter_models_cache(jsonb): يجلب القائمة من OpenRouter API ويحدّث الكاش (كل 6 ساعات أو عند الحاجة)
//  - record_openrouter_model_result(...):   يسجّل نتيجة كل محاولة استخدام لموديل معيّن
// الاختيار الذكي للموديل، والـ Fallback بين الموديلات المجانية، والتحديث الفوري
// عند اكتشاف عطل (Rate Limit / Quota / Timeout / API Error / موديل اتشال) كله هنا.
//
// Actions المدعومة:
//   - "chat"                      : سؤال المستخدم → رد نصي من أول مزود/موديل متاح يرد بنجاح
//   - "test"                      : اختبار اتصال مزود واحد بعينه (تُستخدم من صفحة AI Settings)
//   - "refresh_openrouter_models" : تحديث فوري (يدوي) لقائمة نماذج OpenRouter المجانية (Super Admin)
//   - "retest_openrouter_models"  : إعادة اختبار كل النماذج المجانية الحالية دفعة واحدة (Super Admin)

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const REQUEST_TIMEOUT_MS = 25000;
const OPENROUTER_MODEL_TIMEOUT_MS = 12000;
const OPENROUTER_MODELS_LIST_TIMEOUT_MS = 8000;
const OPENROUTER_MODELS_REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 ساعات
const OPENROUTER_MAX_CANDIDATES = 3; // أقصى عدد موديلات تُجرَّب في نفس الطلب
const OPENROUTER_MAX_CONSECUTIVE_FAILURES = 5; // بعدها الموديل يُستبعد مؤقتاً من الترشيح العادي

type ChatRole = "system" | "user" | "assistant";
interface ChatMessage {
  role: ChatRole;
  content: string;
}

interface ProviderConfigRow {
  id: string;
  provider: "openrouter" | "groq" | "cerebras" | "nvidia_nim" | "zai" | "mistral";
  display_name: string;
  secret_name: string;
  model: string;
  is_active: boolean;
  priority: number;
}

interface OpenRouterModelRow {
  id: string;
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
}

interface OpenRouterStateRow {
  id: boolean;
  current_model: string | null;
  last_models_refresh_at: string | null;
  last_health_check_at: string | null;
  total_models_count: number;
  status: string;
  last_error: string | null;
}

// ---------------------------------------------------------------------------
// طبقة الـ Providers - كل مزود له دالة استدعاء موحدة الشكل:
// (apiKey, model, messages, signal) => Promise<string>
// أي إضافة مزود جديد مستقبلاً تحتاج فقط دالة جديدة هنا + سطر في PROVIDER_CALLERS
// ---------------------------------------------------------------------------

// Groq و Cerebras و NVIDIA NIM و Z.ai و Mistral AI كلهم متوافقين تماماً مع
// صيغة OpenAI Chat Completions (نفس شكل الطلب والرد بالضبط) - فرقهم الوحيد
// هو الـ Base URL. دالة واحدة مشتركة بدل تكرار نفس الكود 5 مرات.
async function callOpenAICompatibleChat(
  providerLabel: string,
  endpoint: string,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  signal: AbortSignal
): Promise<string> {
  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 1200 }),
    signal,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`${providerLabel} ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error(`${providerLabel}: رد فارغ`);
  return text;
}

async function callGroq(apiKey: string, model: string, messages: ChatMessage[], signal: AbortSignal): Promise<string> {
  return callOpenAICompatibleChat("Groq", "https://api.groq.com/openai/v1/chat/completions", apiKey, model, messages, signal);
}

async function callCerebras(apiKey: string, model: string, messages: ChatMessage[], signal: AbortSignal): Promise<string> {
  return callOpenAICompatibleChat("Cerebras", "https://api.cerebras.ai/v1/chat/completions", apiKey, model, messages, signal);
}

async function callNvidiaNim(apiKey: string, model: string, messages: ChatMessage[], signal: AbortSignal): Promise<string> {
  return callOpenAICompatibleChat("NVIDIA NIM", "https://integrate.api.nvidia.com/v1/chat/completions", apiKey, model, messages, signal);
}

async function callZai(apiKey: string, model: string, messages: ChatMessage[], signal: AbortSignal): Promise<string> {
  return callOpenAICompatibleChat("Z.ai", "https://api.z.ai/api/paas/v4/chat/completions", apiKey, model, messages, signal);
}

async function callMistral(apiKey: string, model: string, messages: ChatMessage[], signal: AbortSignal): Promise<string> {
  return callOpenAICompatibleChat("Mistral AI", "https://api.mistral.ai/v1/chat/completions", apiKey, model, messages, signal);
}

// بعض الموديلات المجانية على OpenRouter مش موديلات محادثة أصلاً - هي
// موديلات تصنيف أمان/إشراف (Guard / Moderation) بترجع كلمة أو اتنين بس
// زي "safe" أو "User Safety: safe" بدل رد فعلي. لو موديل زي ده اتاختار
// بالغلط (لأن معدل نجاح الاتصال بتاعه عالي رغم إنه مش مناسب للمحادثة)،
// المستخدم كان بياخد الرد ده كأنه إجابة حقيقية. الدالة دي بتكتشف الشكل
// ده وترفضه كفشل عادي عشان السلسلة تنتقل للموديل التالي تلقائياً.
function looksLikeGuardVerdict(text: string): boolean {
  const trimmed = text.trim();
  if (trimmed.length === 0) return true;
  // ردود قصيرة جداً (أقل من ٨ أحرف) مش منطقية كإجابة على سؤال حقيقي
  if (trimmed.length < 8 && /^(safe|unsafe|ok|yes|no)\.?$/i.test(trimmed)) return true;
  return /^\s*(user\s*)?(content\s*)?safety\s*[:\-]?\s*(safe|unsafe)\b/i.test(trimmed) ||
    /^\s*(safe|unsafe)\s*$/i.test(trimmed) ||
    /^\s*(is_safe|flagged|category)\s*[:=]/i.test(trimmed);
}

// موديلات الـ Guard/Moderation ملهاش لازمة في الأساس نتصل بيها كموديل
// محادثة - بنستبعدها من كتالوج OpenRouter من أول ما نجيب القائمة، عشان
// متتحطش أصلاً ضمن المرشحين حتى لو معدل نجاح الاتصال بتاعها عالي.
function isGuardOrModerationModel(id: string, name: string): boolean {
  const combined = `${id} ${name}`.toLowerCase();
  return /guard|shield|moderation|content-filter|content_filter|safety-checker/.test(combined);
}

// OpenRouter متوافق تماماً مع صيغة OpenAI Chat Completions
async function callOpenRouter(apiKey: string, model: string, messages: ChatMessage[], signal: AbortSignal): Promise<string> {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
      "HTTP-Referer": "https://crm-insurance-project.app",
      "X-Title": "CRM Insurance Assistant",
    },
    body: JSON.stringify({ model, messages, temperature: 0.4, max_tokens: 1200 }),
    signal,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`OpenRouter ${res.status}: ${errText.slice(0, 300)}`);
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content;
  if (!text) throw new Error("OpenRouter: رد فارغ");
  if (looksLikeGuardVerdict(text)) {
    throw new Error(`OpenRouter [${model}]: الموديل ده موديل تصنيف أمان مش محادثة (رجع "${text.trim().slice(0, 60)}") - مش صالح للاستخدام كمساعد`);
  }
  return text;
}

const PROVIDER_CALLERS: Record<
  Exclude<ProviderConfigRow["provider"], "openrouter">,
  (apiKey: string, model: string, messages: ChatMessage[], signal: AbortSignal) => Promise<string>
> = {
  groq: callGroq,
  cerebras: callCerebras,
  nvidia_nim: callNvidiaNim,
  zai: callZai,
  mistral: callMistral,
};

async function callWithTimeout(
  caller: (apiKey: string, model: string, messages: ChatMessage[], signal: AbortSignal) => Promise<string>,
  apiKey: string,
  model: string,
  messages: ChatMessage[],
  timeoutMs: number
): Promise<{ text: string; latencyMs: number }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  const startedAt = Date.now();
  try {
    const text = await caller(apiKey, model, messages, controller.signal);
    return { text, latencyMs: Date.now() - startedAt };
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// OpenRouter Dynamic Models Manager
// ---------------------------------------------------------------------------

// يجلب قائمة النماذج المجانية فقط (:free) من كتالوج OpenRouter العام
async function fetchOpenRouterFreeModelsList(apiKey?: string): Promise<Array<{ id: string; name: string; context_length: number | null }>> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), OPENROUTER_MODELS_LIST_TIMEOUT_MS);
  try {
    const res = await fetch("https://openrouter.ai/api/v1/models", {
      headers: apiKey ? { Authorization: `Bearer ${apiKey}` } : {},
      signal: controller.signal,
    });
    if (!res.ok) {
      throw new Error(`OpenRouter models ${res.status}`);
    }
    const data = await res.json();
    const list: any[] = Array.isArray(data?.data) ? data.data : [];
    return list
      .filter((m) => {
        const id: string = m?.id ?? "";
        const promptPrice = m?.pricing?.prompt;
        const completionPrice = m?.pricing?.completion;
        const isFreeById = id.endsWith(":free");
        const isFreeByPrice = promptPrice !== undefined && Number(promptPrice) === 0 && Number(completionPrice) === 0;
        if (!id || !(isFreeById || isFreeByPrice)) return false;
        // استبعاد موديلات تصنيف الأمان/الإشراف - مش موديلات محادثة
        if (isGuardOrModerationModel(id, (m?.name as string) ?? "")) return false;
        return true;
      })
      .map((m) => ({
        id: m.id as string,
        name: (m.name as string) ?? (m.id as string),
        context_length: typeof m.context_length === "number" ? m.context_length : null,
      }));
  } finally {
    clearTimeout(timer);
  }
}

// يحدّث كاش النماذج في قاعدة البيانات عبر الدالة الذرية refresh_openrouter_models_cache
async function refreshOpenRouterModelsCache(
  adminClient: ReturnType<typeof createClient>,
  apiKey: string
): Promise<{ count: number; error?: string }> {
  try {
    const models = await fetchOpenRouterFreeModelsList(apiKey);
    const { data, error } = await adminClient.rpc("refresh_openrouter_models_cache", {
      p_models: models,
    });
    if (error) throw error;
    return { count: (data as number) ?? models.length };
  } catch (err) {
    const message = err instanceof Error ? err.message : "خطأ غير معروف أثناء تحديث قائمة النماذج";
    await adminClient
      .from("ai_openrouter_state")
      .update({ last_error: message.slice(0, 500), status: "error", updated_at: new Date().toISOString() })
      .eq("id", true);
    return { count: 0, error: message };
  }
}

function needsModelsRefresh(state: OpenRouterStateRow | null): boolean {
  if (!state || !state.last_models_refresh_at) return true;
  const last = new Date(state.last_models_refresh_at).getTime();
  return Date.now() - last > OPENROUTER_MODELS_REFRESH_INTERVAL_MS;
}

// ترتيب ذكي: يفضّل النجاح الأعلى، زمن الاستجابة الأقل، الاستقرار (أقل فشل متتالي)، والتفضيل اليدوي من المدير
function scoreModel(m: OpenRouterModelRow): number {
  const total = m.success_count + m.failure_count;
  const successRate = total === 0 ? 0.7 : m.success_count / total; // نعطي فرصة عادلة للموديلات الجديدة غير المجرَّبة
  const latency = m.avg_latency_ms ?? 4000;
  const latencyPenalty = Math.min(latency / 20000, 0.3);
  const failurePenalty = Math.min(m.consecutive_failures * 0.15, 0.6);
  const recencyBonus = m.last_success_at && Date.now() - new Date(m.last_success_at).getTime() < 60 * 60 * 1000 ? 0.05 : 0;
  return successRate - latencyPenalty - failurePenalty + recencyBonus;
}

async function selectCandidateModels(
  adminClient: ReturnType<typeof createClient>,
  state: OpenRouterStateRow | null
): Promise<OpenRouterModelRow[]> {
  const { data, error } = await adminClient
    .from("ai_openrouter_models")
    .select("*")
    .eq("is_excluded", false);
  if (error || !data) return [];

  let pool = (data as OpenRouterModelRow[]).filter((m) => !isGuardOrModerationModel(m.id, m.name ?? ""));

  // استبعد الموديلات اللي مش موجودة في آخر تحديث للقائمة (اتشالت من OpenRouter)
  if (state?.last_models_refresh_at) {
    const refreshTime = new Date(state.last_models_refresh_at).getTime();
    const stillListed = pool.filter((m) => new Date(m.last_seen_at).getTime() >= refreshTime);
    if (stillListed.length > 0) pool = stillListed;
  }

  // استبعد مؤقتاً الموديلات المتعطلة بشكل متكرر، إلا لو ده كل اللي متاح
  const stable = pool.filter((m) => m.consecutive_failures < OPENROUTER_MAX_CONSECUTIVE_FAILURES);
  if (stable.length > 0) pool = stable;

  pool.sort((a, b) => {
    if (a.is_preferred !== b.is_preferred) return a.is_preferred ? -1 : 1;
    return scoreModel(b) - scoreModel(a);
  });

  return pool;
}

// يجرب أفضل N موديلات مجانية بالترتيب، ولو كلها فشلت يعمل تحديث فوري للقائمة ويعيد المحاولة مرة واحدة
async function runOpenRouterChain(
  adminClient: ReturnType<typeof createClient>,
  apiKey: string,
  messages: ChatMessage[]
): Promise<{ reply: string; provider: string; attempts: string[] }> {
  const attempts: string[] = [];

  const { data: stateRow } = await adminClient.from("ai_openrouter_state").select("*").eq("id", true).maybeSingle();
  let state = stateRow as OpenRouterStateRow | null;

  if (needsModelsRefresh(state)) {
    await refreshOpenRouterModelsCache(adminClient, apiKey);
    const { data: refreshedState } = await adminClient.from("ai_openrouter_state").select("*").eq("id", true).maybeSingle();
    state = refreshedState as OpenRouterStateRow | null;
    await adminClient.from("ai_openrouter_state").update({ last_health_check_at: new Date().toISOString() }).eq("id", true);
  }

  async function tryCandidates(candidates: OpenRouterModelRow[]): Promise<{ reply: string; provider: string } | null> {
    for (const model of candidates.slice(0, OPENROUTER_MAX_CANDIDATES)) {
      try {
        const { text, latencyMs } = await callWithTimeout(callOpenRouter, apiKey, model.id, messages, OPENROUTER_MODEL_TIMEOUT_MS);
        await adminClient.rpc("record_openrouter_model_result", {
          p_model_id: model.id,
          p_success: true,
          p_latency_ms: latencyMs,
          p_reason: null,
        });
        await adminClient.from("ai_openrouter_state").update({ current_model: model.id, status: "ok", last_error: null, updated_at: new Date().toISOString() }).eq("id", true);
        return { reply: text, provider: `OpenRouter (${model.name ?? model.id})` };
      } catch (err) {
        const reason = err instanceof Error ? err.message : "خطأ غير معروف";
        attempts.push(`OpenRouter [${model.id}]: ${reason}`);
        await adminClient.rpc("record_openrouter_model_result", {
          p_model_id: model.id,
          p_success: false,
          p_latency_ms: null,
          p_reason: reason,
        });
      }
    }
    return null;
  }

  let candidates = await selectCandidateModels(adminClient, state);
  if (candidates.length === 0) {
    attempts.push("OpenRouter: لا يوجد أي نموذج مجاني متاح في الكاش");
  } else {
    const result = await tryCandidates(candidates);
    if (result) return { ...result, attempts };
  }

  // كل الموديلات المرشحة فشلت (أو مفيش كاش أصلاً) → تحديث فوري بدون انتظار الـ 6 ساعات وإعادة محاولة مرة واحدة
  await refreshOpenRouterModelsCache(adminClient, apiKey);
  const { data: freshState } = await adminClient.from("ai_openrouter_state").select("*").eq("id", true).maybeSingle();
  candidates = await selectCandidateModels(adminClient, freshState as OpenRouterStateRow | null);
  const retryResult = await tryCandidates(candidates);
  if (retryResult) return { ...retryResult, attempts };

  throw new Error(attempts.join("\n") || "لا يوجد أي نموذج مجاني متاح حالياً على OpenRouter");
}

// ---------------------------------------------------------------------------
// AI Provider Manager: يجرب المزودين المفعّلين بالترتيب، ولو فشل واحد
// (انتهاء حصة، رصيد، Timeout، Rate Limit، خطأ خدمة...) ينتقل للتالي تلقائياً.
// عند وصول السلسلة لآخر مزود بدون نجاح، runProviderChain لا تكرر المحاولة من
// أول واحد فى نفس الطلب (تفادياً لحلقة لا نهائية) - لكن كل طلب "chat" جديد
// من المستخدم يبدأ من جديد من priority=1 دائماً (OpenRouter)، فعملياً كل
// الطلبات بتدور فى نفس دورة الأولوية المغلقة (Circular Rotation) طالما
// OpenRouter هو نقطة البداية الثابتة فى كل مرة.
// ---------------------------------------------------------------------------
async function runProviderChain(
  adminClient: ReturnType<typeof createClient>,
  providers: ProviderConfigRow[],
  messages: ChatMessage[]
): Promise<{ reply: string; provider: string }> {
  const attempts: string[] = [];

  for (const provider of providers) {
    const apiKey = Deno.env.get(provider.secret_name);
    if (!apiKey) {
      attempts.push(`${provider.display_name}: مفتاح API غير موجود في Supabase Secrets (${provider.secret_name})`);
      continue;
    }

    if (provider.provider === "openrouter") {
      try {
        const result = await runOpenRouterChain(adminClient, apiKey, messages);
        return { reply: result.reply, provider: result.provider };
      } catch (err) {
        attempts.push(err instanceof Error ? err.message : "OpenRouter: خطأ غير معروف");
      }
      continue;
    }

    try {
      const caller = PROVIDER_CALLERS[provider.provider];
      const { text } = await callWithTimeout(caller, apiKey, provider.model, messages, REQUEST_TIMEOUT_MS);
      return { reply: text, provider: provider.display_name };
    } catch (err) {
      attempts.push(`${provider.display_name}: ${err instanceof Error ? err.message : "خطأ غير معروف"}`);
    }
  }

  throw new Error(
    "تعذر الحصول على رد من أي مزود ذكاء اصطناعي متاح حالياً.\n" + attempts.join("\n")
  );
}

// ---------------------------------------------------------------------------
// نقطة الدخول
// ---------------------------------------------------------------------------
Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return new Response(JSON.stringify({ error: "غير مصرح: لا يوجد رمز دخول" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerAuth, error: callerAuthError } = await callerClient.auth.getUser();
    if (callerAuthError || !callerAuth?.user) {
      return new Response(JSON.stringify({ error: "غير مصرح: جلسة غير صالحة" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    async function requireSuperAdmin(): Promise<boolean> {
      const { data: callerProfile } = await adminClient
        .from("users")
        .select("role")
        .eq("id", callerAuth.user.id)
        .maybeSingle();
      return !!callerProfile && callerProfile.role === "super_admin";
    }

    const body = await req.json();
    const action = body?.action;

    if (action === "test") {
      const providerId = body?.providerId;
      if (!providerId) {
        return new Response(JSON.stringify({ error: "providerId مطلوب" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!(await requireSuperAdmin())) {
        return new Response(JSON.stringify({ error: "غير مصرح: هذه العملية تتطلب صلاحية مدير النظام" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: provider, error: providerErr } = await adminClient
        .from("ai_provider_configs")
        .select("*")
        .eq("id", providerId)
        .maybeSingle();

      if (providerErr || !provider) {
        return new Response(JSON.stringify({ error: "المزود غير موجود" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const apiKey = Deno.env.get(provider.secret_name);
      let status: "connected" | "error" = "connected";
      let message = "الاتصال ناجح";

      if (!apiKey) {
        status = "error";
        message = `مفتاح API غير موجود في Supabase Secrets باسم ${provider.secret_name}`;
      } else if (provider.provider === "openrouter") {
        try {
          const result = await runOpenRouterChain(adminClient, apiKey, [
            { role: "user", content: "قول كلمة 'تم' فقط بدون أي إضافة." },
          ]);
          message = `الاتصال ناجح (${result.provider})`;
        } catch (err) {
          status = "error";
          message = err instanceof Error ? err.message : "خطأ غير معروف";
        }
      } else {
        try {
          const caller = PROVIDER_CALLERS[provider.provider as Exclude<ProviderConfigRow["provider"], "openrouter">];
          await callWithTimeout(caller, apiKey, provider.model, [
            { role: "user", content: "قول كلمة 'تم' فقط بدون أي إضافة." },
          ], REQUEST_TIMEOUT_MS);
        } catch (err) {
          status = "error";
          message = err instanceof Error ? err.message : "خطأ غير معروف";
        }
      }

      await adminClient
        .from("ai_provider_configs")
        .update({
          last_tested_at: new Date().toISOString(),
          last_test_status: status,
          last_test_message: message.slice(0, 500),
        })
        .eq("id", providerId);

      return new Response(JSON.stringify({ status, message }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "refresh_openrouter_models") {
      if (!(await requireSuperAdmin())) {
        return new Response(JSON.stringify({ error: "غير مصرح: هذه العملية تتطلب صلاحية مدير النظام" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const apiKey = Deno.env.get("OPENROUTER_API_KEY");
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "مفتاح OPENROUTER_API_KEY غير موجود في Supabase Secrets" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const result = await refreshOpenRouterModelsCache(adminClient, apiKey);
      if (result.error) {
        return new Response(JSON.stringify({ error: result.error }), {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ count: result.count }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "retest_openrouter_models") {
      if (!(await requireSuperAdmin())) {
        return new Response(JSON.stringify({ error: "غير مصرح: هذه العملية تتطلب صلاحية مدير النظام" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const apiKey = Deno.env.get("OPENROUTER_API_KEY");
      if (!apiKey) {
        return new Response(JSON.stringify({ error: "مفتاح OPENROUTER_API_KEY غير موجود في Supabase Secrets" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: modelsData } = await adminClient
        .from("ai_openrouter_models")
        .select("*")
        .eq("is_excluded", false);
      const models = (modelsData ?? []) as OpenRouterModelRow[];

      const testMessage: ChatMessage[] = [{ role: "user", content: "قول كلمة 'تم' فقط بدون أي إضافة." }];
      const results = await Promise.allSettled(
        models.map(async (m) => {
          try {
            const { latencyMs } = await callWithTimeout(callOpenRouter, apiKey, m.id, testMessage, OPENROUTER_MODEL_TIMEOUT_MS);
            await adminClient.rpc("record_openrouter_model_result", {
              p_model_id: m.id,
              p_success: true,
              p_latency_ms: latencyMs,
              p_reason: null,
            });
            return { id: m.id, ok: true };
          } catch (err) {
            const reason = err instanceof Error ? err.message : "خطأ غير معروف";
            await adminClient.rpc("record_openrouter_model_result", {
              p_model_id: m.id,
              p_success: false,
              p_latency_ms: null,
              p_reason: reason,
            });
            return { id: m.id, ok: false, reason };
          }
        })
      );

      const succeeded = results.filter((r) => r.status === "fulfilled" && (r.value as any).ok).length;
      await adminClient.from("ai_openrouter_state").update({ last_health_check_at: new Date().toISOString() }).eq("id", true);

      return new Response(JSON.stringify({ tested: models.length, succeeded, failed: models.length - succeeded }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (action === "chat") {
      const { message, history, systemContext, dataContext } = body as {
        message: string;
        history?: { role: "user" | "assistant"; content: string }[];
        systemContext?: string;
        dataContext?: unknown;
      };

      if (!message || typeof message !== "string") {
        return new Response(JSON.stringify({ error: "message مطلوب" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const { data: providers, error: providersErr } = await adminClient
        .from("ai_provider_configs")
        .select("*")
        .eq("is_active", true)
        .order("priority", { ascending: true });

      if (providersErr) {
        return new Response(JSON.stringify({ error: "تعذر قراءة إعدادات مزودي الذكاء الاصطناعي" }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (!providers || providers.length === 0) {
        return new Response(
          JSON.stringify({
            error: "لا يوجد أي مزود ذكاء اصطناعي مُفعّل حالياً. برجاء تفعيل مزود من صفحة إعدادات الذكاء الاصطناعي (AI Settings).",
          }),
          { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const systemPrompt = buildSystemPrompt(systemContext, dataContext);

      const messages: ChatMessage[] = [
        { role: "system", content: systemPrompt },
        ...((history || []).slice(-12).map((h) => ({ role: h.role, content: h.content }))),
        { role: "user", content: message },
      ];

      try {
        const { reply, provider } = await runProviderChain(adminClient, providers as ProviderConfigRow[], messages);
        return new Response(JSON.stringify({ reply, provider }), {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      } catch (err) {
        return new Response(
          JSON.stringify({
            error: "المساعد الذكي مش متاح دلوقتي، حاول تاني بعد شوية.",
            details: err instanceof Error ? err.message : String(err),
          }),
          { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(JSON.stringify({ error: "action غير معروف" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "خطأ غير متوقع" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function buildSystemPrompt(systemContext: unknown, dataContext: unknown): string {
  return [
    "انت مساعد ذكاء اصطناعي احترافي داخل نظام CRM لشركة تأمين على الحياة في مصر.",
    "دورك: تجاوب على أسئلة المستخدم، تحلل بياناته، تقدّم اقتراحات عملية، وتساعده في كتابة محتوى (رسائل، تقارير، خطابات...).",
    "اتكلم بالعربية، وافهم اللهجة المصرية في أسئلة المستخدم وجاوب بأسلوب واضح ومحترف.",
    "",
    "قواعد صارمة يجب الالتزام بها:",
    "- انت لا تنفذ أي عملية على قاعدة البيانات (لا إضافة، لا تعديل، لا حذف) - انت مستشار بس مش أداة تنفيذ.",
    "- اعتمد فقط على البيانات المرفقة لك في 'بيانات النظام' تحت. لو البيانات مش كفاية للإجابة، وضّح ده صراحة، ولا تخترع أرقام أو معلومات غير موجودة.",
    "- افصل وضّح بين: الحقائق (الأرقام كما هي)، والتحليل (تفسيرك للأرقام)، والاقتراحات (خطوات عملية) - خصوصاً في الأسئلة التحليلية.",
    "- خلي ردودك مختصرة وواضحة إلا لو المستخدم طلب تفصيل أو محتوى طويل (زي رسالة أو تقرير).",
    "- متكررش نفس بيانات السياق حرفياً، لخصها بأسلوبك.",
    "",
    systemContext ? `سياق الصفحة الحالية: ${systemContext}` : "",
    dataContext ? `بيانات النظام المتاحة حالياً (بصلاحية المستخدم الحالي فقط):\n${JSON.stringify(dataContext)}` : "لا توجد بيانات نظام مرفقة مع هذا السؤال.",
  ]
    .filter(Boolean)
    .join("\n");
}
