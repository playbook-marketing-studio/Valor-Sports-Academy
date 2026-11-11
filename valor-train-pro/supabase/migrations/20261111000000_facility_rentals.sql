-- Facility rental calendar (11/11/2026, Corey's ask 10/28; Omar: renters can request a time, the app is
-- the source of truth, and it links to Valor's Google Calendar).
--   facility_renters         a group that rents the floor (Maniacs, a club team, a trainer)
--   facility_renter_members  which logins belong to a renter. A renter-only login has profiles.role = 'renter';
--                            a Valor parent can also be a member and keeps role 'parent'.
--   facility_blocks          every block on the floor: a rental (pending request or approved), Valor's own
--                            time (classes) or closed. Times are timestamptz; the app works in Pacific time.
--   facility_gcal            the one Google Calendar connection (refresh token encrypted by the edge function)
--   facility_gcal_busy       cache of what is on that Google Calendar (not the events this app wrote there)
-- All writes go through the `facility` edge function (service role). Staff may read the tables directly;
-- renters only ever get the sanitized calendar the function returns (no names, no notes of other groups).

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check check (role in ('admin','parent','athlete','renter'));

create table if not exists public.facility_renters (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_name text,
  contact_email text,
  contact_phone text,
  is_example boolean not null default false,  -- test renter: alerts go to Omar only, nothing is written to Google
  archived_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.facility_renter_members (
  renter_id uuid not null references public.facility_renters(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  invited_at timestamptz not null default now(),
  primary key (renter_id, user_id)
);
create index if not exists facility_renter_members_user_idx on public.facility_renter_members(user_id);

create table if not exists public.facility_blocks (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('rental','valor','closed')),
  renter_id uuid references public.facility_renters(id) on delete restrict,
  title text,                                   -- valor/closed: what it is ("Classes"); rental: optional label
  space text not null default 'full' check (space in ('full','half')),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'approved' check (status in ('pending','approved','declined','canceled')),
  series_id uuid,                               -- blocks made together by "repeats every week"
  note text,                                    -- the renter's note on a request
  staff_note text,                              -- the coach's reply when declining
  requested_by uuid references auth.users(id) on delete set null,
  decided_by uuid references auth.users(id) on delete set null,
  decided_at timestamptz,
  created_by uuid references auth.users(id) on delete set null,
  gcal_event_id text,                           -- the event this block has on Valor's Google Calendar
  gcal_synced_at timestamptz,
  gcal_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at > starts_at),
  check ((kind = 'rental') = (renter_id is not null)),
  check (kind = 'rental' or space = 'full')
);
create index if not exists facility_blocks_time_idx on public.facility_blocks(starts_at, ends_at);
create index if not exists facility_blocks_status_idx on public.facility_blocks(status);
create index if not exists facility_blocks_renter_idx on public.facility_blocks(renter_id);
create index if not exists facility_blocks_series_idx on public.facility_blocks(series_id);

create table if not exists public.facility_gcal (
  id int primary key default 1 check (id = 1),
  email text,
  calendar_id text not null default 'primary',
  refresh_token_enc text,
  connected_at timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  last_sync_at timestamptz,
  last_error text
);

create table if not exists public.facility_gcal_busy (
  event_id text primary key,
  title text,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  fetched_at timestamptz not null default now()
);
create index if not exists facility_gcal_busy_time_idx on public.facility_gcal_busy(starts_at, ends_at);

-- How much of the floor is free for the whole window: 2 = all of it, 1 = half, 0 = none.
-- A half-turf rental takes 1, everything else takes 2. Only approved blocks count.
-- p_gcal = also count what is on Valor's Google Calendar (each event takes the whole floor).
create or replace function public.facility_units_free(p_start timestamptz, p_end timestamptz, p_exclude uuid default null, p_gcal boolean default false)
returns int language sql stable security definer set search_path = public as $$
  with busy as (
    select starts_at, ends_at, case when kind = 'rental' and space = 'half' then 1 else 2 end as units
      from public.facility_blocks
     where status = 'approved' and starts_at < p_end and ends_at > p_start and (p_exclude is null or id <> p_exclude)
    union all
    select starts_at, ends_at, 2 from public.facility_gcal_busy
     where p_gcal and starts_at < p_end and ends_at > p_start
  ), pts as (
    select p_start as t
    union
    select starts_at from busy where starts_at > p_start
  )
  select (2 - coalesce(max((select coalesce(sum(b.units), 0) from busy b where b.starts_at <= pts.t and b.ends_at > pts.t)), 0))::int
    from pts
$$;
revoke all on function public.facility_units_free(timestamptz, timestamptz, uuid, boolean) from public, anon, authenticated;

-- No double booking: an approved block never lands on a floor that is already taken by approved blocks.
-- (Google Calendar events are checked in the edge function; a coach may approve over one on purpose.)
create or replace function public.facility_blocks_guard()
returns trigger language plpgsql security definer set search_path = public as $$
declare need int;
begin
  -- updated_at is set by the edge function on real edits only (the Google sync compares it with gcal_synced_at)
  if new.status <> 'approved' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'approved' and old.starts_at = new.starts_at and old.ends_at = new.ends_at
     and old.space = new.space and old.kind = new.kind then
    return new;
  end if;
  perform pg_advisory_xact_lock(20261111);
  need := case when new.kind = 'rental' and new.space = 'half' then 1 else 2 end;
  if public.facility_units_free(new.starts_at, new.ends_at, new.id, false) < need then
    raise exception 'facility_conflict' using errcode = 'P0001';
  end if;
  return new;
end $$;

drop trigger if exists facility_blocks_guard on public.facility_blocks;
create trigger facility_blocks_guard before insert or update on public.facility_blocks
  for each row execute procedure public.facility_blocks_guard();

alter table public.facility_renters enable row level security;
alter table public.facility_renter_members enable row level security;
alter table public.facility_blocks enable row level security;
alter table public.facility_gcal enable row level security;
alter table public.facility_gcal_busy enable row level security;

-- staff read everything except the Google token row; a login can see which renter it belongs to (for the menu)
drop policy if exists facility_renters_staff_read on public.facility_renters;
create policy facility_renters_staff_read on public.facility_renters for select using (public.is_admin());
drop policy if exists facility_members_staff_read on public.facility_renter_members;
create policy facility_members_staff_read on public.facility_renter_members for select using (public.is_admin() or user_id = auth.uid());
drop policy if exists facility_blocks_staff_read on public.facility_blocks;
create policy facility_blocks_staff_read on public.facility_blocks for select using (public.is_admin());
drop policy if exists facility_gcal_busy_staff_read on public.facility_gcal_busy;
create policy facility_gcal_busy_staff_read on public.facility_gcal_busy for select using (public.is_admin());

revoke all on public.facility_renters, public.facility_renter_members, public.facility_blocks, public.facility_gcal, public.facility_gcal_busy from anon;
revoke insert, update, delete on public.facility_renters, public.facility_renter_members, public.facility_blocks, public.facility_gcal_busy from authenticated;
revoke all on public.facility_gcal from authenticated;
