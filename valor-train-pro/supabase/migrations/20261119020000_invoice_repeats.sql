-- Repeating invoices (Omar's go 11/19/2026: "ok do it"). Additive only.
-- The app makes each repeat itself (a fresh one-time Stripe invoice through the normal send path), so Stripe
-- subscriptions and the autopay webhook are never involved.
create table if not exists public.invoice_repeats (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.billing_contacts(id),
  every text not null check (every in ('week', '2weeks', 'month')),
  mode text not null default 'send' check (mode in ('send', 'draft', 'booked')), -- send it / draft to check / draft from booked days
  lines jsonb not null default '[]'::jsonb,       -- [{description, quantity, unit_cents}]
  memo text,
  pay_methods text[] not null default array['card'],
  due_days int not null default 7 check (due_days between 0 and 60),
  anchor_day int,                                  -- day of month for monthly repeats (31 = last day in short months)
  next_date date not null,                         -- Pacific date the next one is made
  end_date date,                                   -- no more after this date
  status text not null default 'active' check (status in ('active', 'paused', 'stopped')),
  period_start date,                               -- booked mode: bill booked days from here up to next_date
  runs int not null default 0,
  last_run_on date,
  last_invoice_id uuid,
  last_note text,                                  -- why the last run made nothing, or what failed
  source_invoice_id uuid references public.invoices(id) on delete set null,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists invoice_repeats_due on public.invoice_repeats (next_date) where status = 'active';

alter table public.invoices add column if not exists repeat_id uuid references public.invoice_repeats(id) on delete set null;
alter table public.invoices add column if not exists repeat_plan jsonb; -- on a draft: {every, mode, end_date}; becomes a repeat when it's sent

alter table public.invoice_repeats enable row level security;
drop policy if exists invoice_repeats_staff_read on public.invoice_repeats;
create policy invoice_repeats_staff_read on public.invoice_repeats for select using (public.is_admin());
