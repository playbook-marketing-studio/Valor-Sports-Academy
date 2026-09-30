-- Security audit 2026-09-30. Open sign-up has no email check (mailer_autoconfirm on), so an
-- email address typed at /register proves nothing. Before this, the new-user trigger trusted it:
--   * an email on staff_allowlist with no account yet (mbibe@eou.edu) became ADMIN on sign-up;
--   * any sign-up whose email matched athletes.parent_email got that minor's record attached.
-- Now a sign-up is always a plain parent with nothing linked. Admin happens
-- only when the account was created by staff (an invite sets auth.users.invited_at, which only
-- the service role can do): Omar invites staff. Parents come in through "Show login QR", and the
-- staff function links that one athlete (siblings get linked when staff tap their QR too). No
-- linking by email in the database: parent_email can come from the public booking form.

-- 1. sign-up: parent, nothing linked, role in user metadata ignored (anyone can set it)
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, email, full_name, phone, role)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', new.raw_user_meta_data->>'phone', 'parent')
  on conflict (id) do nothing;
  if new.invited_at is not null then perform public.apply_invite(new.id); end if;
  return new;
end $$;

-- 2. invite (staff-created account): staff allowlist -> admin
create or replace function public.apply_invite(uid uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v_email text;
begin
  select lower(email) into v_email from auth.users where id = uid;
  if v_email is null then return; end if;
  if exists (select 1 from public.staff_allowlist s where lower(s.email) = v_email) then
    update public.profiles set role = 'admin' where id = uid;
  end if;
end $$;
revoke all on function public.apply_invite(uuid) from public, anon, authenticated;

create or replace function public.handle_user_invited()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public.apply_invite(new.id);
  return new;
end $$;

drop trigger if exists on_auth_user_invited on auth.users;
create trigger on_auth_user_invited
  after update of invited_at on auth.users
  for each row when (old.invited_at is null and new.invited_at is not null)
  execute procedure public.handle_user_invited();

-- 3. profiles: users may edit their name and phone only. email and role are not theirs to change
--    (the staff function looks accounts up by email; a parent could set it to a staff address).
revoke update on public.profiles from anon, authenticated;
grant update (full_name, phone) on public.profiles to authenticated;
