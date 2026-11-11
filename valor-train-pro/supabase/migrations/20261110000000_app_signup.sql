-- Self sign-up can pay (Valor's 11/9/2026 ask). Additive only: nothing already live reads these.
--   app_signup_at / app_signup_role: the athlete was added by a family in the app ("Who's training?"),
--   not by staff. Staff see a "Signed up in the app" tag, and their first autopay month is prorated.
--   merge_athletes(from, into): staff "Same kid as..." when an app sign-up duplicates a roster kid.
--   Called only by the family edge function (service role) after it checks the caller is staff.

alter table public.athletes add column if not exists app_signup_at timestamptz;
alter table public.athletes add column if not exists app_signup_role text check (app_signup_role in ('athlete', 'parent'));

create or replace function public.merge_athletes(from_id uuid, into_id uuid)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  f public.athletes;
  t public.athletes;
  r record;
  n int;
  moved jsonb := '{}'::jsonb;
begin
  if from_id = into_id then raise exception 'same athlete'; end if;
  select * into f from public.athletes where id = from_id for update;
  select * into t from public.athletes where id = into_id for update;
  if f.id is null or t.id is null then raise exception 'athlete not found'; end if;
  if f.archived_at is not null then raise exception 'that record is already archived'; end if;

  -- every table with an athlete_id column follows the kid (payments, autopay, class visits, assessments, messages...)
  for r in
    select c.table_name from information_schema.columns c
    join information_schema.tables tb on tb.table_schema = c.table_schema and tb.table_name = c.table_name and tb.table_type = 'BASE TABLE'
    where c.table_schema = 'public' and c.column_name = 'athlete_id'
  loop
    execute format('update public.%I set athlete_id = $1 where athlete_id = $2', r.table_name) using into_id, from_id;
    get diagnostics n = row_count;
    if n > 0 then moved := moved || jsonb_build_object(r.table_name, n); end if;
  end loop;

  -- the app login moves over when the roster record has no login yet (staff check the names before merging);
  -- if it already has a different one, that login stays and the caller is told. Contact info fills gaps only.
  update public.athletes set
    parent_id = coalesce(t.parent_id, f.parent_id),
    user_id = coalesce(t.user_id, f.user_id),
    parent_name = coalesce(nullif(t.parent_name, ''), f.parent_name),
    parent_email = coalesce(nullif(t.parent_email, ''), f.parent_email),
    parent_phone = coalesce(nullif(t.parent_phone, ''), f.parent_phone),
    age = coalesce(t.age, f.age),
    sport = coalesce(nullif(t.sport, ''), f.sport),
    updated_at = now()
  where id = into_id;

  -- the duplicate leaves the family's Home (parents' list doesn't filter archived rows)
  update public.athletes set archived_at = now(), parent_id = null, user_id = null,
    notes = trim(both from coalesce(notes, '') || ' Merged into ' || t.first_name || ' ' || coalesce(t.last_name, '') || ' on ' || to_char(now() at time zone 'America/Los_Angeles', 'MM/DD/YYYY') || '.')
  where id = from_id;

  return jsonb_build_object('moved', moved,
    'login_moved', t.parent_id is null and f.parent_id is not null,
    'kept_other_login', t.parent_id is not null and f.parent_id is not null and t.parent_id <> f.parent_id);
end $$;

revoke execute on function public.merge_athletes(uuid, uuid) from public, anon, authenticated;
