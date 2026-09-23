-- Valor Train Pro · staff-driven flow (2026-09-23 evening, Omar's redirect)
-- Cold leads book on the SITE (free assessment, no account, no payment). Each booking is
-- pushed here. Staff run the assessment in the app, send the parent a login, and take
-- payment for a program on the spot (Stripe QR) or record cash / Venmo.

-- assessment is free
update public.settings set value = jsonb_set(value, '{fee_cents}', '0'::jsonb) where key = 'assessment';
alter table public.bookings alter column amount_cents set default 0;
update public.bookings set amount_cents = 0;

-- programs, from valorsportsacademywa.com/programs (9/23/2026). Staff pick one at payment time.
insert into public.settings (key, value) values ('plans', '[
  {"key":"inseason_2x","name":"In-season, 2x a week","amount_cents":19900,"interval":"month"},
  {"key":"inseason_1x","name":"In-season, 1x a week","amount_cents":9900,"interval":"month"},
  {"key":"offseason_3x","name":"Off-season, 3x a week","amount_cents":29900,"interval":"month"},
  {"key":"drop_in","name":"Drop-in session","amount_cents":2500,"interval":null}
]'::jsonb) on conflict (key) do update set value = excluded.value;

-- bookings pushed from the site's booking function
alter table public.bookings add column if not exists source text not null default 'app';
alter table public.bookings add column if not exists source_booking_id uuid unique;
alter table public.bookings add column if not exists quiz_result text;
alter table public.bookings add column if not exists requested_day date;
alter table public.bookings add column if not exists requested_window text;
alter table public.bookings add column if not exists checked_in_at timestamptz;
alter table public.bookings alter column source drop default;
alter table public.bookings alter column source set default 'app';

-- athletes can exist before the parent has a login (staff set them up at the assessment)
alter table public.athletes alter column parent_id drop not null;
alter table public.athletes add column if not exists parent_name text;
alter table public.athletes add column if not exists parent_email text;
alter table public.athletes add column if not exists parent_phone text;
alter table public.athletes add column if not exists invited_at timestamptz;
create index if not exists athletes_parent_email_idx on public.athletes (lower(parent_email));

-- assessment results entered by staff during the session
create table public.assessments (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  booking_id uuid references public.bookings(id) on delete set null,
  date date not null default current_date,
  metrics jsonb not null default '{}'::jsonb,        -- sprint_10yd, sprint_40yd, pro_agility, vertical_in, broad_jump_in
  work_on text,                                      -- the one or two things to work on first
  recommended_plan text,                             -- a plans[].key
  notes text,
  coach_id uuid references public.profiles(id) default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index assessments_athlete_idx on public.assessments(athlete_id, date desc);
create trigger assessments_touch before update on public.assessments for each row execute procedure public.touch_updated_at();

-- payments for programs (not the assessment)
create table public.payments (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  parent_id uuid references public.profiles(id) on delete set null,
  plan_key text,
  description text not null,
  amount_cents int not null check (amount_cents >= 0),
  currency text not null default 'usd',
  kind text not null default 'one_time' check (kind in ('one_time','subscription')),
  method text not null check (method in ('card','cash','venmo','other')),
  status text not null default 'pending' check (status in ('pending','paid','canceled','refunded')),
  stripe_checkout_session_id text unique,
  stripe_subscription_id text,
  stripe_customer_id text,
  paid_at timestamptz,
  recorded_by uuid references public.profiles(id),
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index payments_athlete_idx on public.payments(athlete_id, created_at desc);
create trigger payments_touch before update on public.payments for each row execute procedure public.touch_updated_at();

alter table public.assessments enable row level security;
alter table public.payments enable row level security;
create policy assessments_admin_all on public.assessments for all using (public.is_admin()) with check (public.is_admin());
create policy assessments_family_read on public.assessments for select using (public.is_my_athlete(athlete_id));
create policy payments_admin_all on public.payments for all using (public.is_admin()) with check (public.is_admin());
create policy payments_family_read on public.payments for select using (parent_id = auth.uid() or public.is_my_athlete(athlete_id));
grant all on public.assessments, public.payments to authenticated;

-- when a parent account is created (invite or sign-up), attach the athletes and bookings staff set up under that email
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
  if v_role = 'parent' then
    update public.athletes set parent_id = new.id where parent_id is null and lower(parent_email) = lower(new.email);
    update public.bookings set parent_id = new.id where parent_id is null and lower(parent_email) = lower(new.email);
    update public.payments p set parent_id = new.id from public.athletes a
      where p.athlete_id = a.id and a.parent_id = new.id and p.parent_id is null;
  end if;
  return new;
end $$;

-- staff roster view: athlete + parent login state + latest paid plan
create or replace view public.athletes_admin with (security_invoker = true) as
  select a.*,
    pr.email as parent_login_email,
    (select u.last_sign_in_at from auth.users u where u.id = a.parent_id) as parent_last_sign_in_at,
    (select p.description from public.payments p where p.athlete_id = a.id and p.status = 'paid' order by p.paid_at desc nulls last limit 1) as last_paid_plan,
    (select p.paid_at from public.payments p where p.athlete_id = a.id and p.status = 'paid' order by p.paid_at desc nulls last limit 1) as last_paid_at,
    (select b.slot_start from public.bookings b where b.athlete_id = a.id order by b.slot_start desc nulls last limit 1) as assessment_at
  from public.athletes a left join public.profiles pr on pr.id = a.parent_id;
grant select on public.athletes_admin to authenticated;
