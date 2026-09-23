-- Bookings are staff-managed now; parents only read theirs (day-1 policy let them edit payment fields).
drop policy if exists bookings_parent_update on public.bookings;
