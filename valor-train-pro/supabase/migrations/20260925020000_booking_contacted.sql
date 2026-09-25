-- When staff texted/called a lead who wants an assessment time. Requests move from
-- "Waiting on a text" to "Texted, waiting to hear back" once this is set.
alter table public.bookings add column if not exists contacted_at timestamptz;
