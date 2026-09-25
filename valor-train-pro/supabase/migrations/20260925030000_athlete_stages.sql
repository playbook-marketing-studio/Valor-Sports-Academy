-- Athlete stage follows the real path (Omar 9/25): lead (waiting on a text) ->
-- reached_out (texted) -> booked (has an assessment time) -> assessed -> enrolled.
-- Enrolled = paid and active, OR in a class (on a program), so current members
-- imported from Corey's roster read "Enrolled", not "Booked".
create or replace view public.athletes_admin with (security_invoker = true) as
SELECT a.id,
    a.parent_id,
    a.user_id,
    a.first_name,
    a.last_name,
    a.birthdate,
    a.age,
    a.sport,
    a.school,
    a.notes,
    a.created_at,
    a.updated_at,
    a.parent_name,
    a.parent_email,
    a.parent_phone,
    a.invited_at,
    a.archived_at,
    a.grad_year,
    a."position",
    pr.email AS parent_login_email,
    parent_last_sign_in(a.parent_id) AS parent_last_sign_in_at,
    ( SELECT p.description
           FROM payments p
          WHERE p.athlete_id = a.id AND p.status = 'paid'::text
          ORDER BY p.paid_at DESC NULLS LAST
         LIMIT 1) AS last_paid_plan,
    ( SELECT p.paid_at
           FROM payments p
          WHERE p.athlete_id = a.id AND p.status = 'paid'::text
          ORDER BY p.paid_at DESC NULLS LAST
         LIMIT 1) AS last_paid_at,
    ( SELECT sum(p.classes_total - p.classes_used) AS sum
           FROM payments p
          WHERE p.athlete_id = a.id AND p.status = 'paid'::text AND (p.covers_until IS NULL OR p.covers_until > now()) AND p.classes_total IS NOT NULL) AS classes_left,
    ( SELECT b.slot_start
           FROM bookings b
          WHERE b.athlete_id = a.id
          ORDER BY b.slot_start DESC NULLS LAST
         LIMIT 1) AS assessment_at,
    ( SELECT count(*) AS count
           FROM assessments s
          WHERE s.athlete_id = a.id) AS assessment_count,
        CASE
            WHEN a.archived_at IS NOT NULL THEN 'archived'::text
            WHEN athlete_enrolled(a.id) OR (EXISTS ( SELECT 1
               FROM program_assignments pa
              WHERE pa.athlete_id = a.id)) THEN 'enrolled'::text
            WHEN (EXISTS ( SELECT 1
               FROM assessments s
              WHERE s.athlete_id = a.id)) THEN 'assessed'::text
            WHEN (EXISTS ( SELECT 1
               FROM bookings b
              WHERE b.athlete_id = a.id AND b.slot_start IS NOT NULL AND b.status <> ALL (ARRAY['canceled'::text, 'requested'::text]))) THEN 'booked'::text
            WHEN (EXISTS ( SELECT 1
               FROM bookings b
              WHERE b.athlete_id = a.id AND b.status = 'requested'::text AND b.contacted_at IS NOT NULL)) THEN 'reached_out'::text
            WHEN (EXISTS ( SELECT 1
               FROM bookings b
              WHERE b.athlete_id = a.id AND b.status = 'requested'::text)) THEN 'lead'::text
            ELSE 'new'::text
        END AS stage
   FROM athletes a
     LEFT JOIN profiles pr ON pr.id = a.parent_id;
grant select on public.athletes_admin to authenticated;
