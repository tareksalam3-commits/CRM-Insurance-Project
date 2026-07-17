-- جداول تسجيل الدخول بالبصمة (WebAuthn / Passkeys)

create table if not exists public.webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  device_type text,
  backed_up boolean not null default false,
  transports text[],
  device_label text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

create index if not exists idx_webauthn_credentials_user_id on public.webauthn_credentials(user_id);

alter table public.webauthn_credentials enable row level security;

drop policy if exists "users can view own passkeys" on public.webauthn_credentials;
create policy "users can view own passkeys" on public.webauthn_credentials
  for select using (auth.uid() = user_id);

drop policy if exists "users can delete own passkeys" on public.webauthn_credentials;
create policy "users can delete own passkeys" on public.webauthn_credentials
  for delete using (auth.uid() = user_id);

-- لا توجد سياسات insert/update للمستخدمين العاديين، لأن التسجيل بيتم فقط عبر Edge Functions بصلاحية service_role (بتتخطى RLS تلقائيًا)

create table if not exists public.webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.users(id) on delete cascade,
  challenge text not null,
  type text not null check (type in ('registration','authentication')),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '5 minutes')
);

alter table public.webauthn_challenges enable row level security;
-- بدون أي policies، فقط service_role (Edge Functions) هو اللي يقدر يوصل للجدول ده

create or replace function public.cleanup_expired_webauthn_challenges()
returns void
language sql
security definer
set search_path = public
as $$
  delete from public.webauthn_challenges where expires_at < now();
$$;
;
