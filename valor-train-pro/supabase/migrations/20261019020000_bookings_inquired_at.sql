-- When the family actually asked (10/19/2026). The 9/25 portal import stamped every request
-- with the import time, so "Waiting on a text" had no real order. Backfilled once from the
-- portal leads (occurred_at) and the site's assessment_bookings (created_at); rows without a
-- source fall back to created_at. New rows: ingest-booking sends the site's time, else now().
alter table public.bookings add column if not exists inquired_at timestamptz;
update public.bookings set inquired_at = created_at where inquired_at is null and coalesce(origin, '') <> 'site';
alter table public.bookings alter column inquired_at set default now();
