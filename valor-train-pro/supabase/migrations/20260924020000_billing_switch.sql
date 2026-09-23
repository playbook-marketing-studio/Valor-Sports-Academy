-- Payment model is pending Omar/Corey (9/23). Make it a config switch, not a rebuild.
-- settings.enrollment = {
--   billing: 'one_time' | 'monthly',          -- how a program is charged
--   placeholder: bool,                         -- prices not confirmed yet
--   programs: [{key, name, amount_cents}],     -- what a family enrolls in (content included)
--   drop_in: {name, amount_cents} | null       -- always one time, never unlocks content
-- }
-- Access: enrolled = a paid program payment that hasn't lapsed. One-time: never lapses.
-- Monthly: each paid month covers until covers_until (Stripe renewals add rows; cash/Venmo cover a month).
update public.settings set value = jsonb_build_object(
  'billing', 'one_time',
  'placeholder', coalesce((value->>'placeholder')::boolean, true),
  'programs', jsonb_build_array(jsonb_build_object('key', 'enrollment', 'name', coalesce(value->>'name', 'Valor enrollment'), 'amount_cents', coalesce((value->>'amount_cents')::int, 19900))),
  'drop_in', jsonb_build_object('name', 'Drop-in session', 'amount_cents', 2500)
) where key = 'enrollment' and value ? 'amount_cents';

alter table public.payments add column if not exists covers_until timestamptz;
alter table public.payments drop constraint if exists payments_kind_check;
alter table public.payments add constraint payments_kind_check check (kind in ('one_time','subscription'));
create index if not exists payments_enrolled_idx on public.payments(athlete_id) where status = 'paid';

create or replace function public.athlete_enrolled(aid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.payments p
    where p.athlete_id = aid and p.status = 'paid' and coalesce(p.plan_key, '') <> 'drop_in'
      and (p.covers_until is null or p.covers_until > now())
  )
$$;

-- roster stage follows the same rule (lapsed monthly = back to "assessed")
drop view if exists public.athletes_admin;
create view public.athletes_admin with (security_invoker = true) as
  select a.*,
    pr.email as parent_login_email,
    public.parent_last_sign_in(a.parent_id) as parent_last_sign_in_at,
    (select p.description from public.payments p where p.athlete_id = a.id and p.status = 'paid' and coalesce(p.plan_key,'') <> 'drop_in' order by p.paid_at desc nulls last limit 1) as last_paid_plan,
    (select p.paid_at from public.payments p where p.athlete_id = a.id and p.status = 'paid' order by p.paid_at desc nulls last limit 1) as last_paid_at,
    (select max(p.covers_until) from public.payments p where p.athlete_id = a.id and p.status = 'paid') as enrolled_through,
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
