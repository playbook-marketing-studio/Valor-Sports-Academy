# Valor Train Pro v1 · handover draft (day 1, Wed 9/23/2026)

Draft for the Friday 9/25 3pm handover to Corey and Michael. Day 2 (Thu 9/24 1-3pm) updates this. Written by Playbook (Omar's Claude session).

## What it is

Valor Train Pro is the athlete app: workouts, nutrition, progress and 1RM tracking (everything the Base44 v1 had), plus a booking-to-payment flow for the athlete assessment:

1. Parent fills the assessment form and picks a Saturday slot (`/book`).
2. Parent creates the account that owns the athlete (`/book/account`). Athletes under 18 never own data; the parent does.
3. Parent pays online through Stripe Checkout, or picks "pay at the assessment" (`/book/pay`).
4. Staff see every booking on the Assessments screen and mark in-person payments paid (`/admin/bookings`). Online payments mark themselves through the Stripe webhook.

Roles: `admin` (Corey, Michael, staff), `parent`, `athlete` (athlete logins are v1.1).

## Where it runs

| Piece | Where | Notes |
|---|---|---|
| Code | `valor-sports-academy/valor-train-pro/`, branch `product/train-pro-v1` | React 18 + Vite + Tailwind + shadcn. Base44 removed. |
| Database + auth + functions | Supabase project `valor-train-pro`, ref `gpotwyuttkkygvxzktep` (us-west-1) | Created 9/23 in Omar's org (free plan, no cost). Transfer to a Valor-owned org later. |
| Preview | https://valor-train-7jhy6fdhi-vegan-demons-projects.vercel.app | Vercel preview, Omar's account. Not a Valor domain. Long-term host should be Netlify next to the site (`netlify.toml` is in the folder). |
| Keys | Vault `playbook/.env`: `VALOR_TRAINPRO_SUPABASE_URL / _ANON_KEY / _SERVICE_ROLE_KEY / _DB_PASSWORD` | Front end reads `valor-train-pro/.env` (gitignored, copy of `.env.example`). |

Run locally: `npm install && npm run dev` (needs `.env`). Build: `npm run build`. Deploy functions: `supabase functions deploy booking stripe-checkout stripe-webhook --no-verify-jwt --project-ref gpotwyuttkkygvxzktep --use-api`. Schema: `supabase db push --linked`.

## What works (verified in a browser 9/23)

- Booking form with live Saturday slots (10:00 to 12:30 PT, 30 min, one athlete per slot, unique index so no double booking; "None of these work?" files a time request).
- Parent sign-up inside the flow, booking attached to the new account, athlete row created automatically.
- "Pay at the assessment" path end to end, confirmation page, parent dashboard shows the athlete and payment status.
- Staff Assessments screen: search, Upcoming / Unpaid / All filters, Mark paid / Undo, status (booked, requested, attended, no show, canceled), assessment fee setting.
- Stripe webhook handler: a signed `checkout.session.completed` marks the booking paid; a forged signature is rejected (tested against the deployed function with a placeholder secret).
- Sign in / sign out / password reset (Supabase auth, email confirmation off so onboarding is one flow).
- Workouts, Nutrition, Progress, 1RM screens run on Supabase with per-user row security. Admins can read everything.
- Branding: the site's palette (paper, ink, red), Anton + Hanken Grotesk, the real emblem.

## What is stubbed or waiting

- **Stripe Checkout** returns "not connected yet" until `STRIPE_SECRET_KEY` is set as a Supabase secret. Code is complete; it needs keys and one real test-mode purchase. Webhook secret is a placeholder today.
- **Assessment fee is a placeholder: $50.** Set the real number on the Assessments screen (or `settings.assessment.fee_cents`).
- **Emails** (booking confirmation, receipt, reminder): none yet. Day 2.
- **Site link**: the marketing site's `/assessment` result card still uses the old Playbook booking function. Day 2 wires the result card to `/book?athlete=…&parent=…&email=…` on the app (the form accepts those prefills already).
- **Seed data**: no In-Season workout plan yet (Base44 data was never exported). Day 2 adds a starter plan.
- **Nutrition label scanner**: disabled (it was a Base44 function on an LLM key nobody owns). Manual macro entry works.
- **Google sign-in**: removed (no OAuth client). Email + password only.
- **Subscription tier** (Stripe Billing + Customer Portal): v1.1, week of 9/28.
- **Coach-to-athlete assignment, athlete logins**: v1.1. The schema already has `athletes.user_id` for it.
- Test rows to delete before launch: parent `parent-test@valortrainpro.test`, admin `admin-test@valortrainpro.test` (also in `staff_allowlist`), booking for "Jordan Tester".

## What Omar must supply

1. **Stripe keys** (test mode first) into the vault as `VALOR_STRIPE_SECRET_KEY`, `VALOR_STRIPE_WEBHOOK_SECRET`, `VALOR_STRIPE_PUBLISHABLE_KEY`, then:
   `supabase secrets set STRIPE_SECRET_KEY=sk_test_… STRIPE_WEBHOOK_SECRET=whsec_… --project-ref gpotwyuttkkygvxzktep`
   Webhook endpoint in Stripe: `https://gpotwyuttkkygvxzktep.supabase.co/functions/v1/stripe-webhook`, events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`.
2. **Domain** for the app (roadmap suggests `app.valorsportsacademywa.com`), then set it as Supabase auth Site URL + redirect allow list and the `APP_URL` function secret.
3. **Corey's staff list**: emails to put in `staff_allowlist` so they land as admins when they sign up. Today: omar@playbookmarketing.studio, coreybibe30@gmail.com, mbibe@eou.edu.
4. The real assessment fee.
5. Decision: Netlify (recommended, next to the site) or keep Vercel.
