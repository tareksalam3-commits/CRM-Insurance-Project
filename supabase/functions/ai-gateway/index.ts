// Edge Function: ai-gateway
// ============================================================================
// نقطة الدخول المركزية الوحيدة لأي ميزة تعتمد على الذكاء الاصطناعي فى
// التطبيق (Provider Manager). تُستخدم حالياً من ميزات استخراج البيانات
// (إضافة عميل / إصدار وثيقة / استيراد بيانات)، وأي ميزة قادمة يجب أن تمر
// من هنا أيضاً — بنفس الشكل تماماً: ترسل messages فقط، ولا تعرف اسم أي
// مزود أو طريقة عمله.
//
// المسؤوليات:
//   - التأكد من أن المنظومة مفعّلة (ai_settings.ai_enabled).
//   - عند وجود صور ضمن الرسائل (استخراج بيانات من صورة/PDF): محاولة
//     استخراج النص أولاً عبر أفضل مزود OCR متاح ومفعّل (OCR.Space حالياً)،
//     ثم إرسال النص الناتج كنص عادي لأفضل مزود AI متاح لتحليله وتحويله
//     لـ JSON منظم — بدلاً من إرسال الصورة نفسها للنموذج (أدق وأرخص).
//   - إذا كان OCR غير متاح/غير مفعّل/بلا مفتاح/فشل الاستخراج: ينتقل تلقائياً
//     ودون أي تدخل من المستدعي لإرسال الصور مباشرة لأحد نماذج AI التى تدعم
//     الصور (Vision) — بالضبط السلوك الأصلي قبل إضافة دعم OCR.
//   - اختيار أفضل مزود AI متاح تلقائياً (enabled + status=active) حسب
//     الأولوية، واختيار أفضل نموذج مجاني مناسب (default_model المخزّن).
//   - عند حدوث أي خطأ أو انتهاء حصة مع مزود (AI أو OCR): تسجيل الخطأ
//     والانتقال تلقائياً للمزود التالي فى الترتيب (Automatic Failover) دون
//     تدخل من المستدعي، ودون أن يتوقف التطبيق بسبب تعطل أي خدمة.
//
// قابلية التوسع (Provider Manager):
//   لإضافة مزود AI جديد: أضف دالة call<Provider> + سجّلها فى AI_PROVIDERS.
//   لإضافة مزود OCR جديد: أضف دالة call<Provider> + سجّلها فى OCR_PROVIDERS.
//   لا حاجة لأي تعديل آخر فى هذا الملف، ولا فى أي صفحة أو Business Logic
//   بالفرونت إند — الصفحات تستدعي askAI() فقط وتستلم { success, content }.
//
// طلب الإدخال المتوقع (بدون أي تغيير عن السابق):
//   { messages: [{ role: 'user' | 'system' | 'assistant',
//                  content: string | Array<{ type: 'text', text: string }
//                                          | { type: 'image_url', image_url: { url: string } }> }],
//     max_tokens?: number, temperature?: number }
//
// الاستجابة (بدون أي تغيير عن السابق؛ ocr_provider حقل إضافي اختياري فقط):
//   { success: true, provider, model, content, ocr_provider? }
//   { success: false, error }
// ============================================================================

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

interface ChatContentPart {
  type: "text" | "image_url";
  text?: string;
  image_url?: { url: string };
}

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
}

function hasImageContent(messages: ChatMessage[]): boolean {
  return messages.some(
    (m) => Array.isArray(m.content) && m.content.some((part) => part.type === "image_url")
  );
}

// ============================================================================
// AI Provider Manager — مزودو توليد النصوص / تحليل الصور (Vision)
// ============================================================================

interface AIProviderRow {
  provider: string;
  api_key: string | null;
  account_id: string | null;
  default_model: string | null;
}

type AICallFn = (
  row: AIProviderRow,
  messages: ChatMessage[],
  maxTokens: number,
  temperature: number
) => Promise<string>;

async function callOpenRouter(apiKey: string, model: string, messages: ChatMessage[], maxTokens: number, temperature: number) {
  const res = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
  });
  if (!res.ok) throw new Error(`OpenRouter: HTTP ${res.status}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("OpenRouter: استجابة فارغة");
  return content as string;
}

async function callGroq(apiKey: string, model: string, messages: ChatMessage[], maxTokens: number, temperature: number) {
  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ model, messages, max_tokens: maxTokens, temperature }),
  });
  if (!res.ok) throw new Error(`Groq: HTTP ${res.status}`);
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error("Groq: استجابة فارغة");
  return content as string;
}

async function callCloudflare(apiKey: string, accountId: string, model: string, messages: ChatMessage[]) {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/run/${model}`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    }
  );
  if (!res.ok) throw new Error(`Cloudflare AI: HTTP ${res.status}`);
  const data = await res.json();
  const content = data?.result?.response;
  if (!content) throw new Error("Cloudflare AI: استجابة فارغة");
  return content as string;
}

// Gemini (Google AI Studio) يستخدم شكل طلب مختلف عن باقي المزودين (OpenAI
// Compatible): رسائل الدور 'system' تُنقَل لحقل systemInstruction منفصل،
// و'assistant' تصبح 'model'، والصور تُرسَل كـ inline_data (mime_type + base64
// بدون بادئة data:...;base64,). Gemini 1.5 يقرأ الصور مباشرة ضمن نفس الطلب،
// فلا يحتاج أي خطوة OCR منفصلة قبله.
function toGeminiRequest(messages: ChatMessage[]) {
  let systemText = "";
  const contents: Array<{ role: string; parts: Array<Record<string, unknown>> }> = [];

  for (const m of messages) {
    const partsFromContent = (): Array<Record<string, unknown>> => {
      if (typeof m.content === "string") return [{ text: m.content }];
      const parts: Array<Record<string, unknown>> = [];
      for (const part of m.content) {
        if (part.type === "text" && part.text) {
          parts.push({ text: part.text });
        } else if (part.type === "image_url" && part.image_url?.url) {
          const match = /^data:([^;]+);base64,(.+)$/.exec(part.image_url.url);
          if (match) parts.push({ inline_data: { mime_type: match[1], data: match[2] } });
        }
      }
      return parts;
    };

    if (m.role === "system") {
      const text = typeof m.content === "string" ? m.content : m.content.map((p) => p.text || "").join("\n");
      systemText += `${text}\n`;
      continue;
    }

    contents.push({ role: m.role === "assistant" ? "model" : "user", parts: partsFromContent() });
  }

  return {
    contents,
    systemInstruction: systemText.trim() ? { parts: [{ text: systemText.trim() }] } : undefined,
  };
}

async function callGemini(apiKey: string, model: string, messages: ChatMessage[], maxTokens: number, temperature: number) {
  const { contents, systemInstruction } = toGeminiRequest(messages);

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents,
        ...(systemInstruction ? { systemInstruction } : {}),
        generationConfig: { maxOutputTokens: maxTokens, temperature },
      }),
    }
  );
  if (!res.ok) throw new Error(`Gemini: HTTP ${res.status}`);
  const data = await res.json();
  const content = (data?.candidates?.[0]?.content?.parts || [])
    .map((p: any) => p?.text || "")
    .join("");
  if (!content) throw new Error("Gemini: استجابة فارغة");
  return content as string;
}

// سجل مزودي AI: "supportsVision" يحدد إن كان المزود يُستبعد تلقائياً عندما
// تحتوي الرسائل صوراً ولم ينجح استخراج OCR (نفس سلوك Cloudflare الأصلي،
// لكن الآن كقاعدة عامة قابلة لإعادة الاستخدام مع أي مزود مستقبلي).
const AI_PROVIDERS: Record<string, { supportsVision: boolean; call: AICallFn }> = {
  openrouter: {
    supportsVision: true,
    call: (row, messages, maxTokens, temperature) =>
      callOpenRouter(row.api_key!, row.default_model!, messages, maxTokens, temperature),
  },
  groq: {
    supportsVision: true,
    call: (row, messages, maxTokens, temperature) =>
      callGroq(row.api_key!, row.default_model!, messages, maxTokens, temperature),
  },
  cloudflare: {
    supportsVision: false,
    call: async (row, messages) => {
      if (!row.account_id) throw new Error("لا يوجد Account ID");
      return callCloudflare(row.api_key!, row.account_id, row.default_model!, messages);
    },
  },
  gemini: {
    supportsVision: true,
    call: (row, messages, maxTokens, temperature) =>
      callGemini(row.api_key!, row.default_model!, messages, maxTokens, temperature),
  },
};

// ============================================================================
// OCR Provider Manager — مزودو استخراج النص من الصور/PDF (يُستخدَمون فقط
// عندما تحتوي الرسائل صوراً، قبل اللجوء لمزودي الـ Vision عند AI_PROVIDERS)
// ============================================================================

interface OcrProviderRow {
  provider: string;
  api_key: string | null;
}

type OcrCallFn = (apiKey: string, imageDataUrl: string) => Promise<string>;

function guessOcrFiletype(dataUrl: string): string {
  const match = /^data:([^;]+);base64,/.exec(dataUrl);
  const mime = (match?.[1] || "").toLowerCase();
  if (mime.includes("pdf")) return "PDF";
  if (mime.includes("png")) return "PNG";
  if (mime.includes("gif")) return "GIF";
  if (mime.includes("bmp")) return "BMP";
  if (mime.includes("tif")) return "TIF";
  return "JPG";
}

async function callOcrSpace(apiKey: string, imageDataUrl: string): Promise<string> {
  const params = new URLSearchParams();
  params.set("apikey", apiKey);
  params.set("base64Image", imageDataUrl);
  params.set("language", "ara");
  params.set("isOverlayRequired", "false");
  params.set("scale", "true");
  params.set("OCREngine", "2");
  params.set("filetype", guessOcrFiletype(imageDataUrl));

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 25000);
  let res: Response;
  try {
    res = await fetch("https://api.ocr.space/parse/image", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) throw new Error(`OCR.Space: HTTP ${res.status}`);
  const data = await res.json();

  const exitCode = Number(data?.OCRExitCode);
  if (data?.IsErroredOnProcessing && exitCode !== 1) {
    const message = Array.isArray(data?.ErrorMessage)
      ? data.ErrorMessage.join(" ")
      : (data?.ErrorMessage || "فشل استخراج النص عبر OCR.Space");
    throw new Error(message);
  }

  const results = Array.isArray(data?.ParsedResults) ? data.ParsedResults : [];
  const text = results.map((r: any) => r?.ParsedText || "").join("\n").trim();
  if (!text) throw new Error("OCR.Space: لم يتم العثور على أي نص فى المستند");
  return text;
}

// سجل مزودي OCR: لإضافة مزود جديد مستقبلاً (مثلاً Azure/Google Vision OCR)
// أضف دالة استدعاء + سطر واحد هنا فقط.
const OCR_PROVIDERS: Record<string, { call: OcrCallFn }> = {
  ocrspace: { call: callOcrSpace },
};

/**
 * يحاول استخراج النص من كل الصور الموجودة برسائل الطلب عبر أفضل مزود OCR
 * مفعّل حسب الأولوية، ويُرجع نسخة جديدة من الرسائل بعد استبدال الصور بالنص
 * المستخرَج. يُرجع null إن تعذّر ذلك تماماً (لا يوجد مزود OCR متاح، أو فشلت
 * كل المزودات المتاحة)، ليكمل المستدعي تلقائياً بالمسار البصري (Vision) دون
 * أي خطأ يظهر للمستخدم.
 */
async function tryOcrRewrite(
  adminClient: ReturnType<typeof createClient>,
  messages: ChatMessage[]
): Promise<{ messages: ChatMessage[]; provider: string } | null> {
  const { data: ocrProviders } = await adminClient
    .from("ai_providers")
    .select("provider, api_key")
    .eq("provider_type", "ocr")
    .eq("enabled", true)
    .eq("status", "active")
    .order("priority", { ascending: true });

  if (!ocrProviders || ocrProviders.length === 0) return null;

  for (const row of ocrProviders as OcrProviderRow[]) {
    const handler = OCR_PROVIDERS[row.provider];
    if (!handler || !row.api_key) continue;

    try {
      const rewritten: ChatMessage[] = [];

      for (const m of messages) {
        if (!Array.isArray(m.content)) {
          rewritten.push(m);
          continue;
        }

        const textParts = m.content.filter((p) => p.type === "text").map((p) => p.text || "");
        const imageParts = m.content.filter((p) => p.type === "image_url" && p.image_url?.url);

        if (imageParts.length === 0) {
          rewritten.push({ role: m.role, content: textParts.join("\n\n") });
          continue;
        }

        const ocrTexts: string[] = [];
        for (const part of imageParts) {
          const extracted = await handler.call(row.api_key!, part.image_url!.url);
          ocrTexts.push(extracted);
        }

        const ocrBlock = `نص مستخرج آلياً عبر OCR من المستند/المستندات المرفقة:\n${
          ocrTexts.length > 1
            ? ocrTexts.map((t, i) => `--- مستند ${i + 1} ---\n${t}`).join("\n\n")
            : ocrTexts[0]
        }`;

        rewritten.push({ role: m.role, content: [...textParts, ocrBlock].filter(Boolean).join("\n\n") });
      }

      return { messages: rewritten, provider: row.provider };
    } catch (ocrErr) {
      const message = ocrErr instanceof Error ? ocrErr.message : "فشل استخراج النص عبر OCR";
      await adminClient
        .from("ai_providers")
        .update({ status: "error", last_error: message, last_tested_at: new Date().toISOString() })
        .eq("provider", row.provider);
      // استمرار تلقائي لمزود OCR التالي حسب الأولوية إن وجد
      continue;
    }
  }

  return null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");

    if (!authHeader) {
      return jsonResponse({ success: false, error: "غير مصرح: لا يوجد رمز دخول" }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: callerAuth, error: callerAuthError } = await callerClient.auth.getUser();
    if (callerAuthError || !callerAuth?.user) {
      return jsonResponse({ success: false, error: "غير مصرح: جلسة غير صالحة" }, 401);
    }

    const body = await req.json();
    const messages = body?.messages as ChatMessage[];
    const maxTokens = Number(body?.max_tokens) || 512;
    const temperature = body?.temperature !== undefined ? Number(body.temperature) : 0.7;

    if (!Array.isArray(messages) || messages.length === 0) {
      return jsonResponse({ success: false, error: "messages مطلوبة" }, 400);
    }

    const { data: settings } = await adminClient.from("ai_settings").select("ai_enabled").maybeSingle();
    if (!settings?.ai_enabled) {
      return jsonResponse({ success: false, error: "منظومة الذكاء الاصطناعي غير مفعّلة حالياً" }, 400);
    }

    // --------------------------------------------------------------------
    // الخطوة 1: لو الرسائل تحتوي صوراً، حاول استخراج النص منها أولاً عبر
    // أفضل مزود OCR متاح. لو نجح، نُكمل بالرسائل النصية الناتجة (أدق
    // وأرخص من إرسال الصورة نفسها). لو فشل أو لا يوجد مزود OCR، نُكمل
    // بالرسائل الأصلية (تحتوي الصور) ليتم إرسالها لمزود AI يدعم Vision.
    // --------------------------------------------------------------------
    const needsVision = hasImageContent(messages);
    let effectiveMessages = messages;
    let ocrUsedProvider: string | null = null;

    if (needsVision) {
      const ocrResult = await tryOcrRewrite(adminClient, messages);
      if (ocrResult) {
        effectiveMessages = ocrResult.messages;
        ocrUsedProvider = ocrResult.provider;
      }
    }

    const stillNeedsVision = hasImageContent(effectiveMessages);

    // --------------------------------------------------------------------
    // الخطوة 2: اختيار أفضل مزود AI متاح حسب الأولوية، مع Fallback تلقائي
    // كامل بين كل المزودين المفعّلين عند فشل أي منهم.
    // --------------------------------------------------------------------
    const { data: providers } = await adminClient
      .from("ai_providers")
      .select("provider, api_key, account_id, default_model")
      .eq("provider_type", "ai")
      .eq("enabled", true)
      .eq("status", "active")
      .order("priority", { ascending: true });

    if (!providers || providers.length === 0) {
      return jsonResponse({ success: false, error: "لا يوجد أي مزود ذكاء اصطناعي مفعّل ومتصل حالياً" }, 400);
    }

    const errors: string[] = [];

    for (const provider of providers as AIProviderRow[]) {
      const handler = AI_PROVIDERS[provider.provider];
      if (!handler) {
        errors.push(`${provider.provider}: مزود غير مدعوم`);
        continue;
      }

      if (!provider.api_key || !provider.default_model) {
        errors.push(`${provider.provider}: لا يوجد مفتاح أو نموذج افتراضي محدد`);
        continue;
      }

      // مزودات AI التى لا تدعم تحليل الصور (Vision) يتم تخطيها تلقائياً فقط
      // عندما تعذّر استخراج OCR وما زالت الرسائل تحتوي صوراً فعلياً، دون أن
      // يُسجَّل ذلك كخطأ فى المزود نفسه (حتى لا يُعطَّل من طلبات نصية لاحقة).
      if (stillNeedsVision && !handler.supportsVision) {
        errors.push(`${provider.provider}: لا يدعم تحليل الصور فى هذه المرحلة`);
        continue;
      }

      try {
        const content = await handler.call(provider, effectiveMessages, maxTokens, temperature);

        // لازم فلتر WHERE صريح حتى لو الجدول Singleton، لأن قاعدة بيانات
        // المشروع مضبوطة على رفض أي UPDATE بدون WHERE clause.
        await adminClient
          .from("ai_settings")
          .update({ active_provider: provider.provider, active_model: provider.default_model })
          .not("id", "is", null);

        return jsonResponse({
          success: true,
          provider: provider.provider,
          model: provider.default_model,
          content,
          ...(ocrUsedProvider ? { ocr_provider: ocrUsedProvider } : {}),
        });
      } catch (callErr) {
        const message = callErr instanceof Error ? callErr.message : "خطأ غير معروف";
        errors.push(`${provider.provider}: ${message}`);
        await adminClient
          .from("ai_providers")
          .update({ status: "error", last_error: message, last_tested_at: new Date().toISOString() })
          .eq("provider", provider.provider);
        // استمرار تلقائي للمزود التالي حسب الأولوية
        continue;
      }
    }

    return jsonResponse(
      { success: false, error: `فشلت كل المزودات المتاحة: ${errors.join(" | ")}` },
      502
    );
  } catch (err) {
    return jsonResponse(
      { success: false, error: err instanceof Error ? err.message : "خطأ غير متوقع" },
      500
    );
  }
});
