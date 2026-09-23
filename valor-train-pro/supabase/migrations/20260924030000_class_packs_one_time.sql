-- Omar 9/23 (final): NO monthly subscriptions of any kind. Payments mirror how Valor sells at the gym:
-- one-time Stripe Checkout per class or class pack. A paid class/pack unlocks the content until it is
-- used up (classes) or expires (config, default none). Staff still mark cash/Venmo paid.
-- settings.enrollment = { placeholder, note, items: [{ key, name, amount_cents, classes (null = unlimited), expires_days (null = never) }] }
update public.settings set value = '{
  "placeholder": true,
  "note": "Confirm with Corey. Placeholders from valorsportsacademywa.com/programs (9/23/2026), which lists these per month.",
  "items": [
    {"key": "drop_in",      "name": "Drop-in session",                  "amount_cents": 2500,  "classes": 1,  "expires_days": null},
    {"key": "inseason_1x",  "name": "In-season, 1x a week (4 classes)",  "amount_cents": 9900,  "classes": 4,  "expires_days": null},
    {"key": "inseason_2x",  "name": "In-season, 2x a week (8 classes)",  "amount_cents": 19900, "classes": 8,  "expires_days": null},
    {"key": "offseason_3x", "name": "Off-season, 3x a week (12 classes)", "amount_cents": 29900, "classes": 12, "expires_days": null}
  ]
}'::jsonb where key = 'enrollment';
-- the coach now recommends one of these items directly
delete from public.settings where key = 'classes';

-- one-time only
update public.payments set kind = 'one_time' where kind <> 'one_time';
alter table public.payments drop constraint if exists payments_kind_check;
alter table public.payments add constraint payments_kind_check check (kind = 'one_time');

-- class counts on each purchase; covers_until now means "expires"
alter table public.payments add column if not exists classes_total int check (classes_total is null or classes_total > 0);
alter table public.payments add column if not exists classes_used int not null default 0 check (classes_used >= 0);

-- class visits staff log (one row per visit, tied to the pack it used)
create table if not exists public.class_visits (
  id uuid primary key default gen_random_uuid(),
  athlete_id uuid not null references public.athletes(id) on delete cascade,
  payment_id uuid references public.payments(id) on delete set null,
  visited_at timestamptz not null default now(),
  logged_by uuid references public.profiles(id) default auth.uid(),
  note text
);
create index if not exists class_visits_athlete_idx on public.class_visits(athlete_id, visited_at desc);
alter table public.class_visits enable row level security;
drop policy if exists class_visits_admin_all on public.class_visits;
create policy class_visits_admin_all on public.class_visits for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists class_visits_family_read on public.class_visits;
create policy class_visits_family_read on public.class_visits for select using (public.is_my_athlete(athlete_id));
grant all on public.class_visits to authenticated;

-- enrolled = a paid class/pack with classes left and not expired
create or replace function public.athlete_enrolled(aid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.payments p
    where p.athlete_id = aid and p.status = 'paid'
      and (p.covers_until is null or p.covers_until > now())
      and (p.classes_total is null or p.classes_used < p.classes_total)
  )
$$;

-- staff log a class visit: uses one class from the oldest active pack (FIFO); returns classes left in it
create or replace function public.log_class_visit(aid uuid, visit_note text default null)
returns int language plpgsql security definer set search_path = public as $$
declare pay public.payments;
begin
  if not public.is_admin() then raise exception 'staff only'; end if;
  select * into pay from public.payments p
   where p.athlete_id = aid and p.status = 'paid'
     and (p.covers_until is null or p.covers_until > now())
     and (p.classes_total is null or p.classes_used < p.classes_total)
   order by p.paid_at asc nulls last limit 1 for update;
  if not found then raise exception 'no active class or pack'; end if;
  update public.payments set classes_used = classes_used + 1 where id = pay.id;
  insert into public.class_visits (athlete_id, payment_id, note) values (aid, pay.id, visit_note);
  return case when pay.classes_total is null then null else pay.classes_total - pay.classes_used - 1 end;
end $$;
grant execute on function public.log_class_visit(uuid, text) to authenticated;

-- roster: classes left across active packs
drop view if exists public.athletes_admin;
create view public.athletes_admin with (security_invoker = true) as
  select a.*,
    pr.email as parent_login_email,
    public.parent_last_sign_in(a.parent_id) as parent_last_sign_in_at,
    (select p.description from public.payments p where p.athlete_id = a.id and p.status = 'paid' order by p.paid_at desc nulls last limit 1) as last_paid_plan,
    (select p.paid_at from public.payments p where p.athlete_id = a.id and p.status = 'paid' order by p.paid_at desc nulls last limit 1) as last_paid_at,
    (select sum(p.classes_total - p.classes_used) from public.payments p where p.athlete_id = a.id and p.status = 'paid'
       and (p.covers_until is null or p.covers_until > now()) and p.classes_total is not null) as classes_left,
    (select b.slot_start from public.bookings b where b.athlete_id = a.id order by b.slot_start desc nulls last limit 1) as assessment_at,
    (select count(*) from public.assessments s where s.athlete_id = a.id) as assessment_count,
    case
      when a.archived_at is not null then 'archived'
      when public.athlete_enrolled(a.id) then 'enrolled'
      when exists (select 1 from public.assessments s where s.athlete_id = a.id) then 'assessed'
      else 'booked'
    end as stage
  from public.athletes a left join public.profiles pr on pr.id = a.parent_id;
grant select on public.athletes_admin to authenticated;
