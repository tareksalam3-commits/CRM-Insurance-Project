// Edge Function: ai-gateway
// ============================================================================
// نقطة الدخول المركزية الوحيدة لأي ميزة تعتمد على الذكاء الاصطناعي فى
// التطبيق. تُستخدم حالياً من ميزة "استخراج البيانات" بصفحة إضافة عميل
// (تحليل صور/مستندات)، وأي ميزة قادمة يجب أن تمر من هنا أيضاً.
//
// المسؤوليات:
//   - التأكد من أن المنظومة مفعّلة (ai_settings.ai_enabled).
//   - اختيار أفضل مزود متاح تلقائياً (enabled + status=active) حسب الأولوية.
//   - اختيار أفضل نموذج مجاني مناسب (default_model المخزّن لكل مزود).
//   - عند حدوث أي خطأ أو انتهاء حصة مع مزود: تسجيل الخطأ والانتقال تلقائياً
//     للمزود التالي فى الترتيب (Automatic Failover) دون تدخل من المستدعي.
//   - يدعم أيضاً رسائل متعددة الوسائط (نص + صور) لتحليل المستندات بصرياً؛
//     المزودات التى لا تدعم الصور (حالياً Cloudflare AI) يتم تخطيها تلقائياً
//     فى هذه الحالة فقط، دون اعتبار ذلك خطأ فى المزود نفسه.
//
// طلب الإدخال المتوقع:
//   { messages: [{ role: 'user' | 'system' | 'assistant',
//                  content: string | Array<{ type: 'text', text: string }
//                                          | { type: 'image_url', image_url: { url: string } }> }],
//     max_tokens?: number, temperature?: number }
//
// الاستجابة:
//   { success: true, provider, model, content }
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

    const { data: providers } = await adminClient
      .from("ai_providers")
      .select("provider, api_key, account_id, default_model")
      .eq("enabled", true)
      .eq("status", "active")
      .order("priority", { ascending: true });

    if (!providers || providers.length === 0) {
      return jsonResponse({ success: false, error: "لا يوجد أي مزود ذكاء اصطناعي مفعّل ومتصل حالياً" }, 400);
    }

    const errors: string[] = [];
    const needsVision = hasImageContent(messages);

    for (const provider of providers) {
      if (!provider.api_key || !provider.default_model) {
        errors.push(`${provider.provider}: لا يوجد مفتاح أو نموذج افتراضي محدد`);
        continue;
      }

      // Cloudflare AI (Workers AI run API) لا يدعم فى منظومتنا حالياً إرسال
      // صور ضمن الرسائل؛ يتم تخطيه لطلبات الصور فقط دون تسجيله كخطأ فى
      // المزود نفسه، حتى لا يُعطَّل من طلبات نصية عادية لاحقة.
      if (needsVision && provider.provider === "cloudflare") {
        errors.push(`${provider.provider}: لا يدعم تحليل الصور فى هذه المرحلة`);
        continue;
      }

      try {
        let content: string;
        if (provider.provider === "openrouter") {
          content = await callOpenRouter(provider.api_key, provider.default_model, messages, maxTokens, temperature);
        } else if (provider.provider === "groq") {
          content = await callGroq(provider.api_key, provider.default_model, messages, maxTokens, temperature);
        } else {
          if (!provider.account_id) {
            errors.push(`${provider.provider}: لا يوجد Account ID`);
            continue;
          }
          content = await callCloudflare(provider.api_key, provider.account_id, provider.default_model, messages);
        }

        await adminClient
          .from("ai_settings")
          .update({ active_provider: provider.provider, active_model: provider.default_model });

        return jsonResponse({ success: true, provider: provider.provider, model: provider.default_model, content });
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
