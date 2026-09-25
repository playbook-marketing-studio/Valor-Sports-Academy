-- Enrolled = an active paid class/pack OR on a program (a coach put them in a class).
-- Current members pay outside the app (UpperHand), so being in a class is the real
-- signal; before this, the Athletes label said Enrolled but workouts stayed locked.
create or replace function public.athlete_enrolled(aid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.payments p
    where p.athlete_id = aid and p.status = 'paid'
      and (p.covers_until is null or p.covers_until > now())
      and (p.classes_total is null or p.classes_used < p.classes_total)
  ) or exists (
    select 1 from public.program_assignments pa where pa.athlete_id = aid
  )
$$;
