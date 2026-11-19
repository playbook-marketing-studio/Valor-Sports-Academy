-- Custom invoicing (Omar's go 11/19/2026; plan: deliverables/Valor-App-Custom-Invoicing-Plan-2026-11-18.md).
-- Coaches bill anyone (a facility renter, a parent, someone new) with their own lines; Stripe Invoicing hosts the
-- pay page, the PDF and the email. A draft lives only here; the Stripe invoice is made when a coach taps Send.
-- Stripe objects carry metadata.kind = custom, so they never touch autopay (the webhook only handles
-- subscription invoices). Staff read only; every write goes through edge fn `invoices` (service role).
-- Additive: the live app doesn't read any of this.

create table if not exists public.billing_contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text not null,
  phone text,
  renter_id uuid references public.facility_renters(id) on delete set null,   -- their booked days can go on an invoice
  parent_id uuid references public.profiles(id) on delete set null,
  stripe_customer_id text,
  is_example boolean not null default false,   -- test contact: the only kind an invoice can be sent to until go-live
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create unique index if not exists billing_contacts_email_idx on public.billing_contacts(lower(email)) where archived_at is null;

create table if not exists public.invoices (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references public.billing_contacts(id) on delete restrict,
  status text not null default 'draft' check (status in ('draft','open','paid','void','uncollectible')),
  due_date date not null,
  memo text,
  pay_methods text[] not null default '{card}',
  total_cents int not null default 0 check (total_cents >= 0),
  amount_paid_cents int not null default 0,
  refunded_cents int not null default 0,
  paid_outside text check (paid_outside in ('cash','venmo','check','other')),  -- marked paid outside Stripe
  paid_at timestamptz,
  stripe_invoice_id text unique,
  stripe_number text,
  hosted_url text,
  pdf_url text,
  sent_at timestamptz,
  sent_by uuid references auth.users(id) on delete set null,
  voided_at timestamptz,
  synced_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists invoices_status_idx on public.invoices(status, due_date);
create index if not exists invoices_contact_idx on public.invoices(contact_id);

create table if not exists public.invoice_lines (
  id uuid primary key default gen_random_uuid(),
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  position int not null default 0,
  description text not null,
  quantity numeric(8,2) not null default 1 check (quantity > 0),
  unit_cents int not null check (unit_cents >= 0),
  amount_cents int not null check (amount_cents >= 0),
  block_id uuid references public.facility_blocks(id) on delete set null,   -- a booked day pulled from the Facility calendar
  created_at timestamptz not null default now()
);
create index if not exists invoice_lines_invoice_idx on public.invoice_lines(invoice_id, position);
create index if not exists invoice_lines_block_idx on public.invoice_lines(block_id) where block_id is not null;

-- who did what and when (created, edited, sent, resent, voided, marked paid, refunded)
create table if not exists public.invoice_events (
  id bigint generated always as identity primary key,
  invoice_id uuid not null references public.invoices(id) on delete cascade,
  action text not null,
  by_user uuid references auth.users(id) on delete set null,
  detail jsonb,
  at timestamptz not null default now()
);
create index if not exists invoice_events_invoice_idx on public.invoice_events(invoice_id, at);

drop trigger if exists invoices_touch on public.invoices;
create trigger invoices_touch before update on public.invoices for each row execute procedure public.touch_updated_at();

alter table public.billing_contacts enable row level security;
alter table public.invoices enable row level security;
alter table public.invoice_lines enable row level security;
alter table public.invoice_events enable row level security;
drop policy if exists billing_contacts_staff_read on public.billing_contacts;
drop policy if exists invoices_staff_read on public.invoices;
drop policy if exists invoice_lines_staff_read on public.invoice_lines;
drop policy if exists invoice_events_staff_read on public.invoice_events;
create policy billing_contacts_staff_read on public.billing_contacts for select using (public.is_admin());
create policy invoices_staff_read on public.invoices for select using (public.is_admin());
create policy invoice_lines_staff_read on public.invoice_lines for select using (public.is_admin());
create policy invoice_events_staff_read on public.invoice_events for select using (public.is_admin());
revoke insert, update, delete on public.billing_contacts, public.invoices, public.invoice_lines, public.invoice_events from anon, authenticated;
grant select on public.billing_contacts, public.invoices, public.invoice_lines, public.invoice_events to authenticated;

-- live = false: an invoice can only be sent to a test contact (the preview shares this database).
-- refund_emails: the logins that may refund a paid invoice (Corey and Michael).
insert into public.settings (key, value) values
  ('invoicing', '{"live": false, "due_days": 7, "bank_enabled": false, "refund_emails": ["coreybibe30@gmail.com", "mbibe@eou.edu"]}'::jsonb)
on conflict (key) do nothing;
