-- First-month modes chosen per enrollment by staff: "full" (full month today), "date" (card check today, full plan on a chosen date).
alter table subscriptions drop constraint if exists subscriptions_first_month_check;
alter table subscriptions add constraint subscriptions_first_month_check check (first_month in ('prorate', 'half', 'none', 'full', 'date'));
