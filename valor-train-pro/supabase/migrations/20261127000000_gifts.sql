-- Gift classes (Black Friday 2026, Omar 11/27: "gift 3 classes", voucher screenshot/download, optional email).
-- A gift is bought by any login and is NOT tied to an athlete until someone claims it with its code.
-- Claiming creates an ordinary paid payments row on the claimer's athlete (classes + covers_until), so class
-- counting, enrollment and refunds work exactly like a pack bought in the app.
-- Only fn gift (service role) writes this table. Givers can read their own gifts.
create table if not exists public.gifts (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,                 -- what the recipient types / the QR carries, e.g. 7K3M-Q9XP
  item_key text not null,
  item_name text not null,
  amount_cents int not null check (amount_cents >= 0),
  classes int check (classes is null or classes > 0),
  expires_at timestamptz,                    -- the classes are good through this, whenever claimed
  giver_id uuid references auth.users(id) on delete set null,
  from_name text,
  to_name text,
  to_email text,                             -- only when the giver picked "email it for me"
  note text,
  status text not null default 'pending' check (status in ('pending', 'paid', 'claimed', 'canceled', 'refunded')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  paid_at timestamptz,
  emailed_at timestamptz,
  claimed_at timestamptz,
  claimed_by uuid references auth.users(id) on delete set null,
  claimed_athlete_id uuid references public.athletes(id) on delete set null,
  claimed_payment_id uuid references public.payments(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists gifts_giver_idx on public.gifts (giver_id);
alter table public.gifts enable row level security;
drop policy if exists gifts_giver_read on public.gifts;
create policy gifts_giver_read on public.gifts for select using (giver_id = auth.uid() or public.is_admin());
grant select on public.gifts to authenticated;
