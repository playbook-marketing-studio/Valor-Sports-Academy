-- A check-in uses the class that expires first (Omar 11/27/2026). Before: the oldest purchase first, so a
-- Black Friday pass (bought Nov 27, good to Jan 31) was used before December's monthly classes, and monthly
-- classes don't roll over, so the family lost them. Now: soonest covers_until first (never-expiring last),
-- then the oldest purchase.
create or replace function public.log_class_visit(aid uuid, visit_note text default null)
returns int language plpgsql security definer set search_path = public as $$
declare pay public.payments;
begin
  if not public.is_admin() then raise exception 'staff only'; end if;
  select * into pay from public.payments p
   where p.athlete_id = aid and p.status = 'paid'
     and (p.covers_until is null or p.covers_until > now())
     and (p.classes_total is null or p.classes_used < p.classes_total)
   order by p.covers_until asc nulls last, p.paid_at asc nulls last limit 1 for update;
  if not found then raise exception 'no active class or pack'; end if;
  update public.payments set classes_used = classes_used + 1 where id = pay.id;
  insert into public.class_visits (athlete_id, payment_id, note) values (aid, pay.id, visit_note);
  return case when pay.classes_total is null then null else pay.classes_total - pay.classes_used - 1 end;
end $$;
grant execute on function public.log_class_visit(uuid, text) to authenticated;
