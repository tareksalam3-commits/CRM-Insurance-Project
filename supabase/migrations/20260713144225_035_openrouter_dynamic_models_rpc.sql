-- [ملف مُعاد بناؤه من الحالة الفعلية لقاعدة البيانات الحية بتاريخ 2026-07-16
--  عبر Supabase MCP — لم يكن موجودًا فى نسخة المستودع الأصلية]
--
-- دوال RPC يستخدمها Edge Function (ai-assistant) لتحديث كاش نماذج
-- OpenRouter المجانية وتسجيل نتيجة كل محاولة استخدام لنموذج.

CREATE OR REPLACE FUNCTION public.refresh_openrouter_models_cache(p_models jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  v_now timestamptz := now();
  v_count integer;
begin
  if p_models is null then
    p_models := '[]'::jsonb;
  end if;

  insert into public.ai_openrouter_models (id, name, context_length, last_seen_at, updated_at)
  select
    (m->>'id'),
    (m->>'name'),
    nullif(m->>'context_length', '')::int,
    v_now,
    v_now
  from jsonb_array_elements(p_models) as m
  where (m->>'id') is not null
  on conflict (id) do update
    set name = excluded.name,
        context_length = excluded.context_length,
        last_seen_at = v_now,
        updated_at = v_now;

  select count(*) into v_count from jsonb_array_elements(p_models);

  update public.ai_openrouter_state
  set
    last_models_refresh_at = v_now,
    last_health_check_at = coalesce(last_health_check_at, v_now),
    total_models_count = v_count,
    status = case when v_count > 0 then 'ok' else 'error' end,
    last_error = case when v_count > 0 then null else 'لم يتم العثور على أي موديل مجاني من OpenRouter' end,
    updated_at = v_now
  where id = true;

  return v_count;
end;
$function$;

CREATE OR REPLACE FUNCTION public.record_openrouter_model_result(
    p_model_id text,
    p_success boolean,
    p_latency_ms integer DEFAULT NULL,
    p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  update public.ai_openrouter_models
  set
    success_count = success_count + (case when p_success then 1 else 0 end),
    failure_count = failure_count + (case when p_success then 0 else 1 end),
    consecutive_failures = case when p_success then 0 else consecutive_failures + 1 end,
    avg_latency_ms = case
      when p_success and p_latency_ms is not null then
        case
          when avg_latency_ms is null then p_latency_ms
          else round((avg_latency_ms::numeric * success_count + p_latency_ms) / (success_count + 1))::int
        end
      else avg_latency_ms
    end,
    last_success_at = case when p_success then now() else last_success_at end,
    last_failure_at = case when p_success then last_failure_at else now() end,
    last_failure_reason = case when p_success then last_failure_reason else left(coalesce(p_reason, ''), 500) end,
    updated_at = now()
  where id = p_model_id;
end;
$function$;
