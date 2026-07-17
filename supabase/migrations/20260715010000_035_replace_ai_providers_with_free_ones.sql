-- إزالة الدعم الكامل لمزودي OpenAI / Gemini / Claude (غير مستخدمين فى التطبيق)
-- وإضافة 5 مزودين جدد مجانيين: Groq, Cerebras, NVIDIA NIM, Z.ai, Mistral AI.
-- OpenRouter (المزود الأساسي، priority = 1) يبقى بدون أي تغيير.
--
-- ملحوظة: جدول ai_provider_configs نفسه (والجداول المرافقة له
-- ai_openrouter_models / ai_openrouter_state) تم إنشاؤهم فى ميجريشن سابقة
-- (033_ai_assistant_infrastructure) لم تكن موجودة فى نسخة المستودع هذه، لذلك
-- هذه الميجريشن تفترض وجودهم بالفعل على قاعدة البيانات الفعلية.

-- 1) حذف صفوف المزودين الملغيين بالكامل أولاً (قبل تعديل الـ constraint،
--    لأن الـ constraint الجديد لا يسمح بقيمهم أصلاً)
delete from public.ai_provider_configs where provider in ('openai', 'gemini', 'claude');

-- 2) تحديث الـ CHECK constraint على عمود provider ليسمح بالمزودين الجدد
--    بدل القدامى (openai/gemini/claude)
alter table public.ai_provider_configs
  drop constraint ai_provider_configs_provider_check;

alter table public.ai_provider_configs
  add constraint ai_provider_configs_provider_check
  check (provider = any (array['openrouter'::text, 'groq'::text, 'cerebras'::text, 'nvidia_nim'::text, 'zai'::text, 'mistral'::text]));

-- 3) إضافة المزودين الجدد بنفس الهيكل المستخدم حالياً. priority تعكس
--    الترتيب الافتراضي المطلوب (OpenRouter = 1 يبقى كما هو، ثم البقية).
--    is_active = true حتى يعملوا فوراً بمجرد ما يتم ضبط مفاتيحهم عبر
--    `supabase secrets set` (لو المفتاح مش موجود، الكود الحالي يتجاهل
--    المزود تلقائياً وينتقل للتالي - بدون أي خطأ للمستخدم).
insert into public.ai_provider_configs (provider, display_name, secret_name, model, is_active, priority, last_test_status)
values
  ('groq',       'Groq',        'GROQ_API_KEY',       'llama-3.3-70b-versatile',     true, 2, 'untested'),
  ('cerebras',   'Cerebras',    'CEREBRAS_API_KEY',   'llama3.1-8b',                 true, 3, 'untested'),
  ('nvidia_nim', 'NVIDIA NIM',  'NVIDIA_NIM_API_KEY', 'meta/llama-3.1-8b-instruct',  true, 4, 'untested'),
  ('zai',        'Z.ai',        'ZAI_API_KEY',        'glm-4.5-flash',               true, 5, 'untested'),
  ('mistral',    'Mistral AI',  'MISTRAL_API_KEY',    'mistral-small-latest',        true, 6, 'untested')
on conflict (provider) do nothing;
