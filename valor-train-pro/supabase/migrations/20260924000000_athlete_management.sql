-- Athlete management (Omar 9/23 night): staff edit athletes, coach-assigned training, archive.
alter table public.athletes add column if not exists archived_at timestamptz;
alter table public.athletes add column if not exists grad_year int;
alter table public.athletes add column if not exists position text;

-- coach-assigned workouts carry the athlete; a parent's log of that workout carries it too
create index if not exists workouts_athlete_idx on public.workouts(athlete_id, date);
create index if not exists workout_logs_workout_idx on public.workout_logs(workout_id);
create index if not exists one_rep_maxes_athlete_idx on public.one_rep_maxes(athlete_id, date desc);

-- parents may log against their own athlete, but not reassign rows to someone else's
create or replace function public.athlete_ok_for_owner(aid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select aid is null or public.is_admin() or public.is_my_athlete(aid)
$$;
do $$
declare t text;
begin
  foreach t in array array['workouts','workout_logs','nutrition_logs','macro_goals','one_rep_maxes'] loop
    execute format('drop policy if exists %I_owner_all on public.%I', t, t);
    execute format('create policy %I_owner_all on public.%I for all using (owner_id = auth.uid()) with check (owner_id = auth.uid() and public.athlete_ok_for_owner(athlete_id))', t, t);
  end loop;
end $$;

-- roster view with stage
drop view if exists public.athletes_admin;
create view public.athletes_admin with (security_invoker = true) as
  select a.*,
    pr.email as parent_login_email,
    public.parent_last_sign_in(a.parent_id) as parent_last_sign_in_at,
    (select p.description from public.payments p where p.athlete_id = a.id and p.status = 'paid' order by p.paid_at desc nulls last limit 1) as last_paid_plan,
    (select p.paid_at from public.payments p where p.athlete_id = a.id and p.status = 'paid' order by p.paid_at desc nulls last limit 1) as last_paid_at,
    (select b.slot_start from public.bookings b where b.athlete_id = a.id order by b.slot_start desc nulls last limit 1) as assessment_at,
    (select count(*) from public.assessments s where s.athlete_id = a.id) as assessment_count,
    case
      when a.archived_at is not null then 'archived'
      when exists (select 1 from public.payments p where p.athlete_id = a.id and p.status = 'paid') then 'enrolled'
      when exists (select 1 from public.assessments s where s.athlete_id = a.id) then 'assessed'
      else 'booked'
    end as stage
  from public.athletes a left join public.profiles pr on pr.id = a.parent_id;
grant select on public.athletes_admin to authenticated;
