-- Messages between Valor staff and families (10/14/2026).
--   announcement: staff post to every family with an athlete in the app (athlete_id is null).
--   direct:       one thread per athlete between staff and that athlete's parent; parents can reply.
-- Minors' data rules: a parent only ever sees announcements plus their own kids' threads,
-- can only add a reply to their own kid's thread, and can never edit or delete anything.
-- Who sent it and whether it came from staff are stamped by the database, not the browser.

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('announcement', 'direct')),
  athlete_id uuid references public.athletes(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  from_staff boolean not null default false,
  title text check (title is null or char_length(title) <= 120),
  body text not null check (char_length(btrim(body)) between 1 and 2000),
  created_at timestamptz not null default now(),
  constraint messages_shape check (
    (kind = 'announcement' and athlete_id is null) or (kind = 'direct' and athlete_id is not null)
  )
);
create index if not exists messages_athlete_idx on public.messages(athlete_id, created_at desc);
create index if not exists messages_created_idx on public.messages(created_at desc);

create table if not exists public.message_reads (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null default auth.uid() references public.profiles(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (message_id, user_id)
);
create index if not exists message_reads_user_idx on public.message_reads(user_id);

-- signed-in senders: sender and staff flag come from the session (service role scripts may set them)
create or replace function public.messages_stamp()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null then
    new.sender_id := auth.uid();
    new.from_staff := public.is_admin();
    new.created_at := now();
  end if;
  return new;
end $$;
drop trigger if exists messages_stamp on public.messages;
create trigger messages_stamp before insert on public.messages
  for each row execute procedure public.messages_stamp();

-- a signed-in parent (or athlete login) with at least one athlete in the app
create or replace function public.has_athlete()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.athletes a where a.parent_id = auth.uid() or a.user_id = auth.uid())
$$;
revoke execute on function public.has_athlete() from public, anon;
grant execute on function public.has_athlete() to authenticated;

alter table public.messages enable row level security;
alter table public.message_reads enable row level security;

drop policy if exists messages_admin_all on public.messages;
create policy messages_admin_all on public.messages for all using (public.is_admin()) with check (public.is_admin());
drop policy if exists messages_family_read on public.messages;
create policy messages_family_read on public.messages for select using (
  (kind = 'announcement' and public.has_athlete()) or (kind = 'direct' and public.is_my_athlete(athlete_id))
);
drop policy if exists messages_family_reply on public.messages;
create policy messages_family_reply on public.messages for insert with check (
  kind = 'direct' and public.is_my_athlete(athlete_id) and title is null
);

drop policy if exists message_reads_read on public.message_reads;
create policy message_reads_read on public.message_reads for select using (user_id = auth.uid() or public.is_admin());
drop policy if exists message_reads_insert on public.message_reads;
create policy message_reads_insert on public.message_reads for insert with check (
  user_id = auth.uid() and exists (select 1 from public.messages m where m.id = message_id)
);

revoke all on public.messages, public.message_reads from anon;
grant select, insert, delete on public.messages to authenticated;
grant select, insert on public.message_reads to authenticated;

-- Unread count for the signed-in user (last 60 days, so a new parent isn't greeted by a backlog).
--   staff:   family replies no staff member has opened yet (one shared inbox)
--   parents: staff messages and announcements they haven't opened
create or replace function public.unread_message_count()
returns int language sql stable security definer set search_path = public as $$
  select (case when public.is_admin() then (
    select count(*) from public.messages m
    where not m.from_staff and m.created_at > now() - interval '60 days'
      and not exists (select 1 from public.message_reads r join public.profiles p on p.id = r.user_id
                      where r.message_id = m.id and p.role = 'admin')
  ) else (
    select count(*) from public.messages m
    where m.from_staff and m.created_at > now() - interval '60 days'
      and ((m.kind = 'announcement' and public.has_athlete()) or (m.kind = 'direct' and public.is_my_athlete(m.athlete_id)))
      and not exists (select 1 from public.message_reads r where r.message_id = m.id and r.user_id = auth.uid())
  ) end)::int
$$;
revoke execute on function public.unread_message_count() from public, anon;
grant execute on function public.unread_message_count() to authenticated;

-- Mark messages read as the signed-in user. Runs as the caller, so it only touches messages they can see.
create or replace function public.mark_messages_read(ids uuid[])
returns void language sql security invoker set search_path = public as $$
  insert into public.message_reads (message_id, user_id)
  select m.id, auth.uid() from public.messages m where m.id = any(ids)
  on conflict do nothing
$$;
revoke execute on function public.mark_messages_read(uuid[]) from public, anon;
grant execute on function public.mark_messages_read(uuid[]) to authenticated;
