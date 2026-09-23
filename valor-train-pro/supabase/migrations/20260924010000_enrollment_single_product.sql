-- Omar 9/23 (via planning session): content is INCLUDED with enrollment. No subscription, no content tier.
-- Stripe charges enrollment only: one product, one-time, price is config until Corey confirms.
-- Access: an athlete whose enrollment is paid (Stripe or marked paid by staff) gets the coach content.

insert into public.settings (key, value) values
  ('enrollment', '{"name": "Valor enrollment", "amount_cents": 19900, "placeholder": true}'::jsonb)
on conflict (key) do nothing;

-- classes a coach can recommend at the assessment (names only; pricing is the single enrollment)
insert into public.settings (key, value)
select 'classes', coalesce(jsonb_agg(jsonb_build_object('key', p->>'key', 'name', p->>'name')) filter (where p->>'key' <> 'drop_in'), '[]'::jsonb)
from public.settings s, jsonb_array_elements(s.value) p where s.key = 'plans'
on conflict (key) do nothing;
delete from public.settings where key = 'plans';

alter table public.payments add column if not exists stripe_payment_intent_id text;
update public.payments set kind = 'one_time' where kind = 'subscription';
alter table public.payments drop constraint if exists payments_kind_check;
alter table public.payments add constraint payments_kind_check check (kind = 'one_time');

-- enrolled = has a paid enrollment payment that hasn't been refunded or voided
create or replace function public.athlete_enrolled(aid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.payments p where p.athlete_id = aid and p.status = 'paid')
$$;

-- coach content reaches the family only once the athlete is enrolled (assessment results stay visible)
drop policy if exists workouts_athlete_family_read on public.workouts;
create policy workouts_athlete_family_read on public.workouts for select
  using (athlete_id is not null and public.is_my_athlete(athlete_id) and public.athlete_enrolled(athlete_id));
drop policy if exists one_rep_maxes_athlete_family_read on public.one_rep_maxes;
create policy one_rep_maxes_athlete_family_read on public.one_rep_maxes for select
  using (athlete_id is not null and public.is_my_athlete(athlete_id) and public.athlete_enrolled(athlete_id));

-- a parent can only log training against an enrolled athlete of their own
create or replace function public.athlete_ok_for_owner(aid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select aid is null or public.is_admin() or (public.is_my_athlete(aid) and public.athlete_enrolled(aid))
$$;
