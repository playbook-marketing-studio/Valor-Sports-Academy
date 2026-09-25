-- Assessment quiz on the athlete: the website quiz score and the parent's answers
-- (sport history, level, training days, strength program, recognition, city,
-- how they heard). Set by ingest-booking from the site booking + its portal lead.
alter table public.athletes
  add column if not exists quiz_result text,
  add column if not exists quiz_answers jsonb,
  add column if not exists quiz_taken_at timestamptz;
