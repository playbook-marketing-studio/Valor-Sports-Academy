# Valor Train Pro v1 · handover draft

Draft for the Friday 9/25 3pm handover to Corey and Michael. Updated Wed 9/23 evening after Omar redirected the flow. Day 2 (Thu 9/24 1-3pm) finishes it.

## How it works now

A cold lead from a Meta ad never makes an account or pays anything up front. The free assessment stays free.

1. **The parent books on the website.** They fill in the assessment form, then pick a Saturday slot. This is the site's existing form and calendar, unchanged.
2. **The booking shows up in the app on its own.** Staff open Assessments and see each Saturday's list, plus anyone who asked for a different time. Every row has call, text, check-in and no-show buttons.
3. **During the assessment, a coach opens the athlete.** They record the test numbers, what to work on first, the class that fits their season, and notes.
4. **After the assessment, staff tap "Get parent login".** A QR code comes up. The parent scans it, sets a password and lands on their kid's page with the results already there. Staff can also text or email the link. It works once, for 24 hours.
5. **The family enrolls in a program.** Workouts, nutrition and training plans are included with enrollment; there's no separate content subscription. Staff take payment on the spot:
   - **Card:** tap "show QR to scan". The parent pays on their own phone with card, Apple Pay or Google Pay.
   - **Cash, Venmo or other:** tap the matching button, and the app records who marked it paid.

Walk-ins with no booking: tap "Walk-in" on the Assessments or Athletes screen. If the parent already has a login, for example a sibling, the new athlete links to it automatically. The waiver stays on paper in person.

## After they sign up: where athletes get edited

Everything about one athlete lives on their page (**Athletes**, then the athlete). It has four tabs:
- **Assessment day:** results, parent login QR, payment. "Start a re-test" records a new set of results without overwriting the first.
- **Profile:** edit athlete and parent details, see siblings and add one, archive (nothing is deleted).
- **Training:** the coach builds workouts for this athlete by week, edits them, and copies a week forward. A check mark means the kid logged it.
- **Progress:** test results over time and max lifts. Workout target weights use this athlete's latest maxes.

Parents see all of it on their phone: results and program on Home, the coach's plan on Workouts, lifts on Progress. They pick the kid when they have more than one. They can fix their kid's basic details, but not coach notes or payments. The **Athletes** roster filters by Booked, Assessed, Enrolled and Archived.

Demo: `DEMO.md` has a 10-minute walkthrough and a seed/purge script with families at every stage.

**Access rule.** An athlete whose enrollment is paid, online or marked paid by staff, unlocks the content. Until then the family sees the assessment results and an enroll-and-pay screen instead of workouts, nutrition and progress. The database enforces this too: a coach's workouts and maxes for an athlete aren't readable by the family until they're enrolled. Undoing a payment or a Stripe refund locks it again.

The assessment itself is always free, and nothing charges for booking one. Families can enroll on the spot with the staff QR code, cash or Venmo. They can also enroll later from their phone with **Enroll and pay**, or from a payment link staff text them.

**Payment model is a switch, pending Omar and Corey (9/23).** On the **Enrollment** screen, staff set:
- **Billing:** "Monthly" or "One time".
  - **Monthly:** the card renews each month through Stripe. Cash or Venmo covers one month, and access stops when a month isn't paid.
  - **One time:** a single payment enrolls them.
- **Programs and prices:** "Use the website's monthly programs" loads $199, $99 and $299 a month in one tap.
- **Drop-in price:** always one time, and it never unlocks content.

Live today it's **One time with a single $199 placeholder enrollment**, marked as a placeholder so staff see a reminder. Switching is a settings change, not a code change.


Roles: `admin` (Corey, Michael, staff), `parent`, `athlete` (athlete logins are v1.1).

## Where it runs

| Piece | Where |
|---|---|
| Code | `valor-sports-academy/valor-train-pro/`, branch `product/train-pro-v1` |
| Database, logins, functions | Supabase project `valor-train-pro`, ref `gpotwyuttkkygvxzktep` (Omar's org, free plan; move to a Valor org later) |
| Site booking to app | The site's booking function (Playbook project) copies every booking to the app's `ingest-booking` function. Switch: secrets `TRAINPRO_INGEST_URL` + `TRAINPRO_INGEST_KEY` on the Playbook project. Resync: `push_app` action. |
| Preview | Vercel preview on Omar's account (link in the Train Pro memory note; it changes on every deploy). Real host should be Netlify next to the site. |
| Keys | Vault `playbook/.env`: `VALOR_TRAINPRO_SUPABASE_*`, `VALOR_TRAINPRO_INGEST_KEY` |

App edge functions: `ingest-booking` (site bookings in), `staff` (parent login link, card payment QR), `stripe-webhook` (marks card payments paid and records monthly renewals).

## Verified 9/23

- A site booking landed in the app with slot, quiz result and ad source. A reschedule updated it without losing the source. A time request showed under "Asked for a different time".
- Check-in, results, parent login QR, cash payment: done end to end as staff.
- The parent opened the login link on a phone-sized screen, set a password and saw their athlete's results and enrolled program.
- A parent account cannot see another family, record a payment, use staff actions or make itself an admin.
- The Stripe webhook accepts a signed event and rejects a forged one (tested day 1).

## Waiting on

- **Self-booking on the site is still off.** It turns on when Michael's Gmail app password is set on the Playbook project (see the booking memory note). Until then parents see "a coach will reach out", and staff can add those families as walk-ins.
- **Card payments** show "not connected" until Stripe keys are set. Cash, Venmo and other work today.
- **Emails from the app** (password reset, login link by email) go through Supabase's built-in sender, which only delivers to project members. Point Supabase Auth at the Valor Gmail (SMTP) once the app password exists. The QR and text options work without it.
- **Assessment tests:** the five tests (10-yard sprint, 40-yard dash, pro agility, vertical, broad jump) are a placeholder list. Corey should confirm what they actually run. It's one settings row, no code change.
- **SMS reminders:** v2, needs a texting provider and has usage costs.
- **v1.1 (week of 9/28):** coach-to-athlete assignment and athlete logins. There is no content tier or subscription; content is included with enrollment (Omar 9/23).
- **Waiting on Omar/Corey:** monthly or one-time billing, and the real programs and prices. Either answer is a change on the Enrollment screen. Both modes were tested 9/23: enroll unlocks, a lapsed month locks, a drop-in doesn't unlock.
- **Staff edits don't flow back to the portal.** Check-in and no-show marked in the app don't update the Playbook portal's Leads tab.
- **Test data to delete before launch:** run `node scripts/demo-data.mjs purge`. It removes every `@valortrainpro.test` family. Then delete the admin-test@valortrainpro.test login and its `staff_allowlist` row, and Omar's own test booking (heyomarvega@gmail.com).
- **Current members aren't in the app yet.** Kids already training at Valor need to be added one at a time with **Add athlete**, or a spreadsheet import could be built. Corey's roster decides which.

## What Omar must supply

1. **Stripe keys** (test mode first) into the vault as `VALOR_STRIPE_SECRET_KEY` and `VALOR_STRIPE_WEBHOOK_SECRET`. The publishable key isn't needed, because checkout is hosted by Stripe. Then run:
   `supabase secrets set STRIPE_SECRET_KEY=sk_test_… STRIPE_WEBHOOK_SECRET=whsec_… --project-ref gpotwyuttkkygvxzktep`
   Webhook URL: `https://gpotwyuttkkygvxzktep.supabase.co/functions/v1/stripe-webhook`. Events: `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `invoice.paid` (monthly renewals), `charge.refunded`.
2. **Michael's Gmail app password.** It turns on site self-booking and can also power the app's emails.
3. **The app domain** (e.g. `app.valorsportsacademywa.com`). It goes into Supabase Auth site URL and redirect list, plus the `APP_URL` secret.
4. **Corey's staff email list**, for `staff_allowlist`. Today it holds omar@playbookmarketing.studio, coreybibe30@gmail.com and mbibe@eou.edu.
5. **Corey's actual assessment tests**, and the real **enrollment price**. It goes on the Enrollment screen; no code change.
