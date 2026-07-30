// Edge Function: ai-test-connection
// يختبر الاتصال بمزود ذكاء اصطناعي واحد (OpenRouter / Groq / Cloudflare AI)
// باستخدام المفتاح المحفوظ فعلياً فى قاعدة البيانات (لا يُستقبل أي مفتاح من
// الفرونت إند مباشرة — القراءة والكتابة على المفتاح تتم فقط من هنا بصلاحية
// service_role، فلا يخرج المفتاح للمتصفح إطلاقاً).
//
// عند نجاح الاختبار: يجلب قائمة النماذج المجانية المتاحة لهذا المزود، ويحدّث
// كاش ai_provider_models + ai_settings.models_updated_at + يختار أول نموذج
// مجاني كـ default_model للمزود.

import { createClient } from "npm:@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type ProviderKey = "openrouter" | "groq" | "cloudflare";

interface FreeModel {
  model_id: string;
  model_name: string | null;
  context_length: number | null;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function testOpenRouter(apiKey: string): Promise<{ models: FreeModel[] }> {
  const res = await fetch("https://openrouter.ai/api/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("مفتاح OpenRouter غير صحيح أو منتهي الصلاحية");
  }
  if (!res.ok) {
    throw new Error(`تعذر الاتصال بـ OpenRouter (HTTP ${res.status})`);
  }
  const data = await res.json();
  const list = Array.isArray(data?.data) ? data.data : [];
  const free = list.filter((m: any) => {
    const prompt = m?.pricing?.prompt;
    const completion = m?.pricing?.completion;
    return (prompt === "0" || prompt === 0) && (completion === "0" || completion === 0);
  });
  return {
    models: free.map((m: any) => ({
      model_id: m.id,
      model_name: m.name ?? m.id,
      context_length: m.context_length ?? null,
    })),
  };
}

async function testGroq(apiKey: string): Promise<{ models: FreeModel[] }> {
  const res = await fetch("https://api.groq.com/openai/v1/models", {
    headers: { Authorization: `Bearer ${apiKey}` },
  });
  if (res.status === 401 || res.status === 403) {
    throw new Error("مفتاح Groq غير صحيح أو منتهي الصلاحية");
  }
  if (!res.ok) {
    throw new Error(`تعذر الاتصال بـ Groq (HTTP ${res.status})`);
  }
  const data = await res.json();
  const list = Array.isArray(data?.data) ? data.data : [];
  // كل نماذج Groq متاحة ضمن الحصة المجانية للحساب
  return {
    models: list.map((m: any) => ({
      model_id: m.id,
      model_name: m.id,
      context_length: m.context_window ?? null,
    })),
  };
}

async function testCloudflare(apiKey: string, accountId: string | null): Promise<{ models: FreeModel[] }> {
  if (!accountId) {
    throw new Error("مطلوب إدخال Cloudflare Account ID قبل اختبار الاتصال");
  }
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${accountId}/ai/models/search`,
    { headers: { Authorization: `Bearer ${apiKey}` } }
  );
  if (res.status === 401 || res.status === 403) {
    throw new Error("مفتاح Cloudflare أو Account ID غير صحيح");
  }
  if (!res.ok) {
    throw new Error(`تعذر الاتصال بـ Cloudflare AI (HTTP ${res.status})`);
  }
  const data = await res.json();
  if (data?.success === false) {
    const msg = data?.errors?.[0]?.message || "فشل التحقق من حساب Cloudflare";
    throw new Error(msg);
  }
  const list = Array.isArray(data?.result) ? data.result : [];
  const textGen = list.filter((m: any) => (m?.task?.name || "").toLowerCase().includes("text generation"));
  return {
    models: textGen.map((m: any) => ({
      model_id: m.name ?? m.id,
      model_name: m.description ?? m.name ?? m.id,
      context_length: null,
    })),
  };
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
      return jsonResponse({ error: "غير مصرح: لا يوجد رمز دخول" }, 401);
    }

    const adminClient = createClient(supabaseUrl, serviceRoleKey);
    const callerClient = createClient(supabaseUrl, serviceRoleKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: callerAuth, error: callerAuthError } = await callerClient.auth.getUser();
    if (callerAuthError || !callerAuth?.user) {
      return jsonResponse({ error: "غير مصرح: جلسة غير صالحة" }, 401);
    }

    const { data: callerProfile } = await adminClient
      .from("users")
      .select("role")
      .eq("id", callerAuth.user.id)
      .maybeSingle();

    if (!callerProfile || callerProfile.role !== "super_admin") {
      return jsonResponse({ error: "غير مصرح: هذا الإجراء متاح لمدير النظام (Super Admin) فقط" }, 403);
    }

    const body = await req.json();
    const provider = body?.provider as ProviderKey;

    if (!["openrouter", "groq", "cloudflare"].includes(provider)) {
      return jsonResponse({ error: "مزود خدمة غير معروف" }, 400);
    }

    const { data: providerRow, error: providerErr } = await adminClient
      .from("ai_providers")
      .select("api_key, account_id")
      .eq("provider", provider)
      .maybeSingle();

    if (providerErr || !providerRow) {
      return jsonResponse({ error: "تعذر العثور على إعدادات هذا المزود" }, 404);
    }

    if (!providerRow.api_key) {
      return jsonResponse({ error: "لا يوجد مفتاح API محفوظ لهذا المزود بعد" }, 400);
    }

    let result: { models: FreeModel[] };
    try {
      if (provider === "openrouter") {
        result = await testOpenRouter(providerRow.api_key);
      } else if (provider === "groq") {
        result = await testGroq(providerRow.api_key);
      } else {
        result = await testCloudflare(providerRow.api_key, providerRow.account_id);
      }
    } catch (testErr) {
      const message = testErr instanceof Error ? testErr.message : "فشل اختبار الاتصال";
      await adminClient
        .from("ai_providers")
        .update({ status: "error", last_error: message, last_tested_at: new Date().toISOString() })
        .eq("provider", provider);

      return jsonResponse({ success: false, status: "error", error: message });
    }

    const now = new Date().toISOString();
    const topModel = result.models[0]?.model_id ?? null;

    await adminClient
      .from("ai_providers")
      .update({
        status: "active",
        last_error: null,
        last_tested_at: now,
        default_model: topModel,
      })
      .eq("provider", provider);

    // تحديث كاش النماذج المجانية لهذا المزود (حذف القديم ثم إدراج الجديد)
    await adminClient.from("ai_provider_models").delete().eq("provider", provider);
    if (result.models.length > 0) {
      await adminClient.from("ai_provider_models").insert(
        result.models.slice(0, 50).map((m) => ({
          provider,
          model_id: m.model_id,
          model_name: m.model_name,
          context_length: m.context_length,
          is_free: true,
          fetched_at: now,
        }))
      );
    }

    await adminClient.from("ai_settings").update({ models_updated_at: now });

    return jsonResponse({ success: true, status: "active", models_found: result.models.length });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : "خطأ غير متوقع" },
      500
    );
  }
});
