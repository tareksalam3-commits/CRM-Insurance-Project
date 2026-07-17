create index if not exists idx_monthly_closings_opened_by on public.monthly_closings (opened_by_user_id);
create index if not exists idx_payments_cancelled_by on public.payments (cancelled_by_user_id);
create index if not exists idx_webauthn_challenges_user_id on public.webauthn_challenges (user_id);
;
