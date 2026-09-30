-- Security audit 2026-09-30, follow-ups M1 + L2.
-- M1: parents read their athletes and fix the basics (the app's parent_edit form). They can no
--     longer delete an athlete (that cascaded away its payments, class visits and assessments)
--     or change coach-owned fields (notes, season, class days, archive, quiz, parent contact).
-- L2: helper functions that reveal data are no longer callable without signing in.

drop policy if exists athletes_parent_all on public.athletes;
create policy athletes_parent_read on public.athletes for select using (parent_id = auth.uid());
create policy athletes_parent_update on public.athletes for update
  using (parent_id = auth.uid()) with check (parent_id = auth.uid());

-- signed-in non-staff may only change these columns (staff, service role and scripts are not limited)
create or replace function public.athletes_parent_guard()
returns trigger language plpgsql as $$
declare
  basics text[] := array['first_name','last_name','age','birthdate','sport','position','school','grad_year','updated_at'];
begin
  if auth.uid() is not null and not public.is_admin() then
    if (to_jsonb(new) - basics) is distinct from (to_jsonb(old) - basics) then
      raise exception 'Only staff can change that' using errcode = '42501';
    end if;
  end if;
  return new;
end $$;
drop trigger if exists athletes_parent_guard on public.athletes;
create trigger athletes_parent_guard before update on public.athletes
  for each row execute procedure public.athletes_parent_guard();

-- current_role_of(uid) told anyone the role of any user id; parent_last_sign_in and
-- log_class_visit already check staff inside, but anon has no reason to call them.
revoke execute on function public.current_role_of(uuid) from public, anon;
revoke execute on function public.parent_last_sign_in(uuid) from public, anon;
revoke execute on function public.log_class_visit(uuid, text) from public, anon;
grant execute on function public.current_role_of(uuid) to authenticated;
grant execute on function public.parent_last_sign_in(uuid) to authenticated;
grant execute on function public.log_class_visit(uuid, text) to authenticated;
