-- Team sign links for the waiver (Omar 11/19/2026: "build it out just in case they want to use it").
-- For outside teams (Maniacs, Jr Bombers) whose kids aren't athletes in the app. Staff make one link + QR per team;
-- a parent opens it with no login, types the kid's name and their own name and email, and signs.
-- Nothing verifies who signed: anyone with the link can fill it out. These rows are kept apart (method 'team',
-- team_id set, athlete_id null) and shown to staff as "not verified" so they're never mistaken for a logged-in signature.
-- Additive: the live app doesn't read any of this.

create table if not exists public.waiver_teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  token text not null unique,            -- random, the link is /waiver/team/<token>; turning the team off kills it
  active boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  turned_off_at timestamptz
);
alter table public.waiver_teams enable row level security;
drop policy if exists waiver_teams_staff_read on public.waiver_teams;
create policy waiver_teams_staff_read on public.waiver_teams for select to authenticated using (public.is_admin());
revoke insert, update, delete on public.waiver_teams from anon, authenticated;

alter table public.waiver_signatures add column if not exists team_id uuid references public.waiver_teams(id) on delete set null;
alter table public.waiver_signatures drop constraint if exists waiver_signatures_method_check;
alter table public.waiver_signatures add constraint waiver_signatures_method_check check (method in ('app', 'link', 'team'));
create index if not exists waiver_signatures_team_idx on public.waiver_signatures(team_id, signed_at desc) where team_id is not null;
