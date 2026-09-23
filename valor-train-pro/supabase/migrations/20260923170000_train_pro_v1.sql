-- Valor Train Pro v1 · data model (2026-09-23)
-- Roles: admin (Corey / Michael / staff), parent (owns one or more athletes), athlete (v1.1 login).
-- Minors' data lives under the parent account: athletes.parent_id is the owner.

create extension if not exists pgcrypto;

-- ── settings (admin-editable key/value) ─────────────────────────────────────
create table public.settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);
insert into public.settings (key, value) values
  ('assessment', '{"fee_cents": 5000, "currency": "usd", "open_until": "2026-11-28", "blackouts": [], "start_min": 600, "end_min": 780, "slot_min": 30, "weekday": 6, "tz": "America/Los_Angeles", "address": "1973 Fowler St, Richland, WA 99352"}'::jsonb);

-- ── staff allowlist: emails that become admin on sign-up ─────────────────────
create table public.staff_allowlist (
  email text primary key,
  note text,
  added_at timestamptz not null default now()
);
insert into public.staff_allowlist (email, note) values
  ('omar@playbookmarketing.studio', 'Playbook'),
  ('coreybibe30@gmail.com', 'Corey Bibe'),
  ('mbibe@eou.edu', 'Michael Bibe');

-- ── profiles (1:1 with auth.users) ──────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  phone text,
  role text not null default 'parent' check (role in ('admin','parent','athlete')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index profiles_role_idx on public.profiles(role);

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_role text := coalesce(new.raw_user_meta_data->>'role', 'parent');
begin
  if exists (select 1 from public.staff_allowlist s where lower(s.email) = lower(new.email)) then
    v_role := 'admin';
  elsif v_role not in ('parent','athlete') then
    v_role := 'parent';
  end if;
  insert into public.profiles (id, email, full_name, phone, role)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone', v_role)
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- role helpers (security definer so RLS policies can call them without recursion)
create or replace function public.current_role_of(uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = uid
$$;
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select role = 'admin' from public.profiles where id = auth.uid()), false)
$$;

-- ── athletes (minors; owned by a parent account) ────────────────────────────
create table public.athletes (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid not null references public.profiles(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null, -- athlete's own login (v1.1)
  first_name text not null,
  last_name text,
  birthdate date,
  age int,
  sport text,
  school text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index athletes_parent_idx on public.athletes(parent_id);

create or replace function public.is_my_athlete(aid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.athletes a
    where a.id = aid and (a.parent_id = auth.uid() or a.user_id = auth.uid())
  )
$$;

-- ── bookings (assessment) ───────────────────────────────────────────────────
create table public.bookings (
  id uuid primary key default gen_random_uuid(),
  claim_token uuid not null default gen_random_uuid(),   -- links a public form submission to the account created right after
  parent_id uuid references public.profiles(id) on delete set null,
  athlete_id uuid references public.athletes(id) on delete set null,
  -- captured on the public form (kept even before an account exists)
  athlete_first_name text not null,
  athlete_last_name text,
  athlete_age int,
  sport text,
  parent_name text not null,
  parent_email text not null,
  parent_phone text,
  how_heard text,
  notes text,
  -- scheduling
  slot_start timestamptz,
  slot_end timestamptz,
  requested_note text,
  status text not null default 'booked' check (status in ('requested','booked','attended','no_show','canceled')),
  -- payment
  amount_cents int not null default 0,
  currency text not null default 'usd',
  payment_method text check (payment_method in ('online','in_person')),
  payment_status text not null default 'unpaid' check (payment_status in ('unpaid','pending','paid','waived','refunded')),
  stripe_checkout_session_id text,
  stripe_payment_intent_id text,
  paid_at timestamptz,
  marked_paid_by uuid references public.profiles(id),
  -- attribution
  source text,
  utm jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index bookings_slot_idx on public.bookings(slot_start);
create index bookings_parent_idx on public.bookings(parent_id);
create index bookings_email_idx on public.bookings(lower(parent_email));
-- one athlete per slot for active bookings
create unique index bookings_active_slot_uidx on public.bookings(slot_start)
  where status in ('booked','attended') and slot_start is not null;

-- ── training data (ported from the Base44 entities, now owner-scoped) ───────
create table public.workouts (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  athlete_id uuid references public.athletes(id) on delete set null,
  title text not null,
  description text,
  date date not null,
  category text default 'Strength',
  program text,
  week int,
  day text,
  exercises jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index workouts_owner_idx on public.workouts(owner_id, date desc);

create table public.workout_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  athlete_id uuid references public.athletes(id) on delete set null,
  workout_id uuid references public.workouts(id) on delete set null,
  workout_title text,
  date date not null,
  week int,
  day text,
  logged_exercises jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index workout_logs_owner_idx on public.workout_logs(owner_id, date desc);

create table public.nutrition_logs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  athlete_id uuid references public.athletes(id) on delete set null,
  meal_name text not null,
  meal_type text default 'Snack',
  calories numeric,
  protein numeric,
  carbs numeric,
  fats numeric,
  date date not null,
  created_at timestamptz not null default now()
);
create index nutrition_logs_owner_idx on public.nutrition_logs(owner_id, date desc);

create table public.macro_goals (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  athlete_id uuid references public.athletes(id) on delete set null,
  calories_goal numeric,
  protein_goal numeric,
  carbs_goal numeric,
  fats_goal numeric,
  date date not null,
  created_at timestamptz not null default now()
);

create table public.one_rep_maxes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  athlete_id uuid references public.athletes(id) on delete set null,
  exercise_name text not null,
  weight numeric not null,
  date date not null,
  notes text,
  created_at timestamptz not null default now()
);
create index one_rep_maxes_owner_idx on public.one_rep_maxes(owner_id, date desc);

-- ── updated_at touch ────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
create trigger profiles_touch before update on public.profiles for each row execute procedure public.touch_updated_at();
create trigger athletes_touch before update on public.athletes for each row execute procedure public.touch_updated_at();
create trigger bookings_touch before update on public.bookings for each row execute procedure public.touch_updated_at();
create trigger workouts_touch before update on public.workouts for each row execute procedure public.touch_updated_at();

-- ── row level security ──────────────────────────────────────────────────────
alter table public.settings enable row level security;
alter table public.staff_allowlist enable row level security;
alter table public.profiles enable row level security;
alter table public.athletes enable row level security;
alter table public.bookings enable row level security;
alter table public.workouts enable row level security;
alter table public.workout_logs enable row level security;
alter table public.nutrition_logs enable row level security;
alter table public.macro_goals enable row level security;
alter table public.one_rep_maxes enable row level security;

-- settings: anyone can read (fee + slot config drive the public form); admins edit
create policy settings_read on public.settings for select using (true);
create policy settings_admin_write on public.settings for all using (public.is_admin()) with check (public.is_admin());

create policy staff_admin_all on public.staff_allowlist for all using (public.is_admin()) with check (public.is_admin());

-- profiles: self + admin
create policy profiles_self_read on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_self_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid() and role = public.current_role_of(auth.uid()));
create policy profiles_admin_update on public.profiles for update using (public.is_admin()) with check (public.is_admin());

-- athletes: parent owns; the athlete's own login can read; admin all
create policy athletes_parent_all on public.athletes for all
  using (parent_id = auth.uid()) with check (parent_id = auth.uid());
create policy athletes_self_read on public.athletes for select using (user_id = auth.uid());
create policy athletes_admin_all on public.athletes for all using (public.is_admin()) with check (public.is_admin());

-- bookings: parent sees own; admin all (mark paid, status). Public inserts go through the edge function (service role).
create policy bookings_parent_read on public.bookings for select using (parent_id = auth.uid());
create policy bookings_parent_update on public.bookings for update
  using (parent_id = auth.uid()) with check (parent_id = auth.uid());
create policy bookings_admin_all on public.bookings for all using (public.is_admin()) with check (public.is_admin());

-- training tables: owner, the parent of the athlete the row is about, admin
do $$
declare t text;
begin
  foreach t in array array['workouts','workout_logs','nutrition_logs','macro_goals','one_rep_maxes'] loop
    execute format('create policy %I_owner_all on public.%I for all using (owner_id = auth.uid()) with check (owner_id = auth.uid())', t, t);
    execute format('create policy %I_athlete_family_read on public.%I for select using (athlete_id is not null and public.is_my_athlete(athlete_id))', t, t);
    execute format('create policy %I_admin_all on public.%I for all using (public.is_admin()) with check (public.is_admin())', t, t);
  end loop;
end $$;

-- ── admin view: bookings with who marked them paid ──────────────────────────
create or replace view public.bookings_admin with (security_invoker = true) as
  select b.*, p.full_name as marked_paid_by_name
  from public.bookings b left join public.profiles p on p.id = b.marked_paid_by;

grant usage on schema public to anon, authenticated;
grant select on public.settings to anon, authenticated;
grant all on all tables in schema public to authenticated;
grant select on public.bookings_admin to authenticated;
