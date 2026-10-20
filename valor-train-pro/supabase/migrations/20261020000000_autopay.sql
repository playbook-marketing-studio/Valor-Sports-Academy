-- Monthly autopay (10/20/2026). Corey 10/19: everyone is charged on the 1st, 3-month commitment
-- (no cancellation fee), mid-month sign-ups pay a reduced first month, then full price on the 1st.
-- Plans: in-season 1x $99 (4 classes), 2x $199 (8), off-season 3x $299 (12). Drop-in stays one-time.
--
-- One row per Stripe subscription. Each paid monthly invoice still becomes a normal payments row
-- (kind 'subscription') holding that month's classes, so athlete_enrolled(), log_class_visit and
-- every screen keep working unchanged: a month = a pack that expires at the next charge + 3 days.
-- Families read their own rows; only staff and the edge functions (service role) write.

create table if not exists public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  parent_id uuid references public.profiles(id) on delete set null,
  plan_key text not null,
  plan_name text not null,
  amount_cents integer not null check (amount_cents > 0),
  classes_per_month integer check (classes_per_month is null or classes_per_month > 0),
  first_month text not null default 'prorate' check (first_month in ('prorate', 'half')),
  first_month_classes integer,
  status text not null default 'pending' check (status in ('pending', 'active', 'past_due', 'canceled', 'expired')),
  stripe_checkout_session_id text unique,
  stripe_subscription_id text unique,
  stripe_customer_id text,
  current_period_end timestamptz,          -- next charge date
  paid_months integer not null default 0,  -- counts toward the 3-month commitment
  last_paid_at timestamptz,
  last_failed_at timestamptz,
  cancel_at_period_end boolean not null default false,
  cancel_requested_by uuid references public.profiles(id) on delete set null,
  canceled_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists subscriptions_athlete_idx on public.subscriptions(athlete_id, created_at desc);

alter table public.subscriptions enable row level security;
drop policy if exists subscriptions_admin_all on public.subscriptions;
create policy subscriptions_admin_all on public.subscriptions for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists subscriptions_family_read on public.subscriptions;
create policy subscriptions_family_read on public.subscriptions for select using (parent_id = auth.uid() or public.is_my_athlete(athlete_id));
revoke all on public.subscriptions from anon;
grant select on public.subscriptions to authenticated;
grant insert, update, delete on public.subscriptions to authenticated; -- RLS limits writes to staff

-- a monthly invoice becomes a payments row; the invoice id makes re-delivered webhooks harmless
alter table public.payments drop constraint if exists payments_kind_check;
alter table public.payments add constraint payments_kind_check check (kind in ('one_time', 'subscription'));
alter table public.payments add column if not exists stripe_invoice_id text unique;
alter table public.payments add column if not exists subscription_id uuid references public.subscriptions(id) on delete set null;
