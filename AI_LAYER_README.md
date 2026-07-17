# طبقة الذكاء الاصطناعي — التوثيق المطابق للنظام الفعلي الشغال

الملف اللي كان اسمه `AI_PROVIDER_LAYER_README.md` كان بيوثّق نظام مختلف
(`ai_providers` + `ai_provider_keys` + Edge Functions باسم `ai-gateway`
و `ai-test-connection`) لم يتم تطبيقه فعلياً على قاعدة البيانات، وكان
سيتعارض مع النظام الحقيقي الشغال بالفعل. تم حذفه، وده التوثيق الصحيح.

## الوضع الفعلي على قاعدة البيانات (مشروع `mqprutudyyzghpiiopqo`)

تم بالفعل تطبيق الميجريشن `033_ai_assistant_infrastructure` ونشر Edge
Function باسم **`ai-assistant`** (وليس `ai-gateway`). هذا هو النظام
الوحيد المعتمد.

### الجداول

- **`ai_provider_configs`** — صف واحد لكل مزود (`openrouter` / `groq` /
  `cerebras` / `nvidia_nim` / `zai` / `mistral`)، بمفتاح Secret واحد فقط
  لكل مزود (لا يوجد دعم لمفاتيح متعددة لكل مزود). الأعمدة: `display_name`,
  `secret_name`, `model`, `is_active`, `priority`, `last_tested_at`,
  `last_test_status` (`connected`/`error`/`untested`),
  `last_test_message`. الوصول مقصور على `super_admin` فقط (RLS).
- **`ai_conversations`** و **`ai_messages`** — لتخزين محادثات المساعد
  الذكي لكل مستخدم (RLS: كل مستخدم يشوف محادثاته هو بس). لسه مش
  مستخدَمة من أي صفحة في الفرونت إند حتى الآن.

المزودون الستة موجودون بالفعل كصفوف، بالترتيب الافتراضي (priority):
OpenRouter (1، المزود الأساسي، مفعّل ومفتاحه `OPENROUTER_API_KEY`)، ثم
Groq (2)، Cerebras (3)، NVIDIA NIM (4)، Z.ai (5)، Mistral AI (6) — الخمسة
دول مفعّلين (`is_active = true`) لكن بانتظار ضبط مفاتيحهم الفعلية عبر
`supabase secrets set SECRET_NAME=...` (بدون المفتاح، الكود يتجاهلهم
تلقائياً وينتقل للمزود التالي بدون أي خطأ يظهر للمستخدم). مزودو OpenAI و
Gemini و Claude تمت إزالتهم بالكامل (لا صفوف، لا Provider Adapter، لا أي
كود خاص بيهم) لأن التطبيق لا يستخدمهم.

### OpenRouter — مدير نماذج مجانية ديناميكي (لا يعتمد على موديل ثابت)

عمود `model` في صف OpenRouter داخل `ai_provider_configs` أصبح بلا
تأثير فعلي (قيمته `auto (dynamic free models)` كملاحظة فقط). بدلاً
منه، مزود OpenRouter بيدير تلقائياً كل النماذج المجانية (`:free`)
المتاحة على الكتالوج العام، عبر جدولين إضافيين:

- **`ai_openrouter_models`** — كاش كل موديل مجاني + إحصاءاته:
  `success_count`, `failure_count`, `consecutive_failures`,
  `avg_latency_ms`, `last_success_at`, `last_failure_at`,
  `last_failure_reason`, `is_excluded` (استبعاد يدوي من المدير),
  `is_preferred` (تفضيل يدوي). وصول `super_admin` فقط (RLS).
- **`ai_openrouter_state`** — صف واحد (Singleton, `id = true`):
  `current_model`, `last_models_refresh_at`, `last_health_check_at`,
  `total_models_count`, `status`, `last_error`.

داخل `ai-assistant/index.ts`:

- قبل كل رد، لو مرّ أكتر من 6 ساعات على آخر تحديث (أو لسه محصلش
  تحديث أصلاً) → يجيب القائمة الحالية من `GET
  https://openrouter.ai/api/v1/models`، يصفّي `:free` بس، ويحدّث
  الكاش عبر `refresh_openrouter_models_cache(jsonb)`.
- الاختيار الذكي (`selectCandidateModels` + `scoreModel`): يرتّب
  الموديلات المتاحة حسب نسبة النجاح، زمن الاستجابة، الاستقرار (أقل
  فشل متتالي)، مع إعطاء الأولوية المطلقة لأي موديل مفضَّل يدوياً.
- الـ Fallback: يجرّب أفضل 3 موديلات بالترتيب؛ لو فشلت كلها، يعمل
  تحديث فوري للقائمة (بدون انتظار الـ 6 ساعات) ويعيد المحاولة مرة
  واحدة قبل الانتقال للمزود التالي في `ai_provider_configs`.
- كل محاولة (نجاح/فشل) بتتسجّل عبر
  `record_openrouter_model_result(...)` — بدون أي محتوى محادثة أو
  بيانات مستخدم، بس اسم الموديل وزمن الاستجابة وسبب الفشل.

Actions إضافية في نفس الدالة (Super Admin فقط، تُستخدم من صفحة AI
Settings):

- `{ action: "refresh_openrouter_models" }` → تحديث فوري يدوي لقائمة
  النماذج (زر "تحديث النماذج").
- `{ action: "retest_openrouter_models" }` → إعادة اختبار كل
  الموديلات المجانية الحالية دفعة واحدة (زر "إعادة اختبار الكل").

تفضيل/استبعاد موديل معيّن بيتم مباشرة من الفرونت إند على جدول
`ai_openrouter_models` (تحديث `is_preferred` / `is_excluded`) بدون
المرور بالـ Edge Function، لأن RLS بتسمح لـ `super_admin` بالتحديث
مباشرة — نفس النمط المتبع مع `ai_provider_configs`.

الواجهة: `src/pages/AISettings/components/OpenRouterModelsPanel.tsx`
تعرض عدد الموديلات المتاحة، الموديل الحالي، آخر تحديث، حالة
OpenRouter، وجدول بكل موديل (نجاح/فشل/زمن استجابة/آخر نجاح) مع أزرار
تفضيل/استبعاد لكل صف.

### دالة الـ Edge Function

**`ai-assistant`** هي نقطة الدخول الوحيدة، وتدعم Action واحد لكل غرض:

- `{ action: "chat", message, history?, systemContext?, dataContext? }`
  → تجرّب المزودين المفعّلين بالترتيب حسب `priority`، وعند فشل أي
  مزود تنتقل تلقائياً للتالي (Fallback)، وترجع `{ reply, provider }`.
- `{ action: "test", providerId }` → اختبار اتصال مزود بعينه
  (Super Admin فقط)، وتحدّث `last_test_status` / `last_test_message`
  في قاعدة البيانات مباشرة.

المفاتيح تُقرأ فقط من Supabase Secrets وقت التنفيذ
(`Deno.env.get(secret_name)`) ولا تُحفظ أبداً في القاعدة أو تُرسل
للفرونت إند.

## الملفات في الفرونت إند (بعد التعديل لتطابق الفعلي)

- `src/lib/aiService.ts` — دالة `askAI()` تنادي `ai-assistant` بـ
  `action: "chat"`.
- `src/pages/AISettings/` — صفحة إدارة المزودين (تفعيل/تعطيل، ترتيب
  المحاولة، تعديل الموديل، اختبار الاتصال) تتعامل حصرياً مع جدول
  `ai_provider_configs` والـ Action `"test"`.

## إضافة مزود جديد مستقبلاً

1. لو المزود متوافق مع صيغة OpenAI Chat Completions (زي Groq وCerebras
   وNVIDIA NIM وZ.ai وMistral AI الحاليين) يكفي سطر واحد جديد يستدعي
   `callOpenAICompatibleChat(label, endpoint, apiKey, model, messages, signal)`
   بالـ Base URL بتاعه، وتسجيله فى `PROVIDER_CALLERS` داخل
   `supabase/functions/ai-assistant/index.ts`. لو المزود له صيغة مختلفة
   تماماً، أضف دالة استدعاء جديدة بنفس التوقيع الموحّد:
   `(apiKey, model, messages, signal) => Promise<string>`.
2. أضف صفاً جديداً في جدول `ai_provider_configs` بنفس اسم المزود
   المستخدم في الكود، وحدد `secret_name` و `model`، وحدّث الـ
   `ai_provider_configs_provider_check` constraint ليسمح بالقيمة الجديدة.
3. اضبط قيمة المفتاح الفعلي: `supabase secrets set SECRET_NAME=...`
4. أعد نشر الدالة: `supabase functions deploy ai-assistant`

## ملاحظة مهمة (محدّثة)

المساعد الذكي في `src/features/assistant` أصبح متصل فعلياً بـ `askAI()`:
الأوامر السريعة والأسئلة المتوقعة (القوائم في `assistantEngine.ts`) لسه
بترجع أرقام حقيقية من قاعدة البيانات مباشرة (أسرع وأدق ومجاني). أي سؤال
حر تاني مش متوقع بيتحول تلقائياً لـ `ai-assistant` عشان يرد برد ذكاء
اصطناعي حقيقي. لو مفيش أي مزود مفعّل في صفحة AI Settings، بيرجع تلقائياً
لقائمة الاقتراحات المحلية القديمة بدل ما يكسر تجربة المستخدم.

كذلك تم تقليص عدد أزرار "الأوامر السريعة" الظاهرة من 19 إلى 8 (الأهم
فقط) — باقي الأوامر لسه شغالة تماماً لو المستخدم كتبها بنفسه.
