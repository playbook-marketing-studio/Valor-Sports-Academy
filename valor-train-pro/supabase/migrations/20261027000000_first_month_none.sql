-- First-month mode "none": no charge until the 1st (Stripe trial), for families who already paid this month elsewhere.
alter table subscriptions drop constraint if exists subscriptions_first_month_check;
alter table subscriptions add constraint subscriptions_first_month_check check (first_month in ('prorate', 'half', 'none'));
