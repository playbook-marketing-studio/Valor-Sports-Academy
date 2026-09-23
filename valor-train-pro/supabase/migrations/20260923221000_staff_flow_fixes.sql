-- bookings.source already existed (ad attribution); keep it that way and track where the booking came from separately
alter table public.bookings alter column source drop default;
alter table public.bookings add column if not exists origin text not null default 'app' check (origin in ('site','walk_in','app'));

-- auth.users is not readable by signed-in users; expose last sign-in to admins only
create or replace function public.parent_last_sign_in(uid uuid)
returns timestamptz language sql stable security definer set search_path = public, auth as $$
  select case when public.is_admin() then (select u.last_sign_in_at from auth.users u where u.id = uid) end
$$;

create or replace view public.athletes_admin with (security_invoker = true) as
  select a.*,
    pr.email as parent_login_email,
    public.parent_last_sign_in(a.parent_id) as parent_last_sign_in_at,
    (select p.description from public.payments p where p.athlete_id = a.id and p.status = 'paid' order by p.paid_at desc nulls last limit 1) as last_paid_plan,
    (select p.paid_at from public.payments p where p.athlete_id = a.id and p.status = 'paid' order by p.paid_at desc nulls last limit 1) as last_paid_at,
    (select b.slot_start from public.bookings b where b.athlete_id = a.id order by b.slot_start desc nulls last limit 1) as assessment_at
  from public.athletes a left join public.profiles pr on pr.id = a.parent_id;
grant select on public.athletes_admin to authenticated;
