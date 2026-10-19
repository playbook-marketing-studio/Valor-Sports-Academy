-- Email alerts (10/19/2026): one row per alert actually sent, so a retry or a re-delivered
-- Stripe event never emails twice. Keys: msg:<message id>, pay:<payment id>:paid|refunded.
-- Only the service role (edge functions) touches it.
create table if not exists public.message_alerts (
  key text primary key,
  sent_at timestamptz not null default now()
);
alter table public.message_alerts enable row level security;
revoke all on public.message_alerts from anon, authenticated;
