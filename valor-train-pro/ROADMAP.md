# Valor Sports Academy: Booking Calendar and Athlete Portal Roadmap

Prepared by Playbook Marketing Studio for Michael and Corey. Dated 2026-09-10. This document is the plan for two pieces of work: the assessment booking calendar (wanted now) and the athlete portal (about three months). It also serves as the working brief for whoever builds it.

Where something is not known, it says so. Nothing here about Base44's account, plan, or data has been verified inside Base44 itself, because nobody at Playbook has logged into it yet.

## 1. Platform recommendation: port off Base44

Recommendation: do not extend Valor Train Pro inside Base44. Port it to a Supabase database with the same React front end, in a new Supabase project owned by Valor, deployed as its own site on a Valor subdomain (for example app.valorsportsacademywa.com, to be confirmed; the only Valor address on file is the Gmail account). Reasons, plainly: (1) the v1 app is small, about 3,000 lines of hand-written code across five screens and six data types, so moving it is estimated at roughly a week of focused work, not a rebuild (an estimate from reading the code, not a measurement); (2) v1 has no idea of a coach, a roster, or a parent, and every screen loads every record with no per-person filter, so the thing you actually asked for (coaches adding things to a specific athlete's portal) needs a new data design on any platform, which removes most of the reason to keep it where it is; (3) everything that already exists for Valor (the website forms, the leads list, the booking calendar being built this week, the confirmation emails, the Meta pixel plumbing) lives on Netlify plus Supabase, so putting the portal there means one login, one place coaches work, and no permanent bridge between two systems; (4) with Base44, the users, the data, and the permission rules live inside Base44 and are not in the exported repo; the one server function's source is in the repo (`base44/functions/scanNutritionLabel/entry.ts`) but it can only run on Base44, because its service-role access only exists in Base44-hosted functions, so leaving later means re-registering families and pulling data by hand; per third-party pricing pages, Base44 bills as monthly tiers plus per-action credits that grow with use, unverified until the Phase 1 walkthrough; (5) the users are minors, and permission rules written as reviewable, tested database policies are safer than rules set by hand in a builder dashboard. What Corey keeps: the ported app is a normal React repo he can edit with AI tools, with preview links on every change; what he gives up is prompting the backend into existence, which is the part that needs care anyway. If you would rather stay on Base44, say so before 2026-10-02: the plan changes materially, Playbook would not build inside Base44, the coach role would have to be built in the Builder and by whom is Corey's call, and Playbook cannot vouch for permissions on minors' data there.

## 2. Workstream 1: assessment booking calendar

Source brief: `/Users/macuser/Documents/Claude/Projects/playbook/valor-sports-academy/deliverables/Valor-Assessment-Booking-Task.md`. This work touches only the public website, the Playbook Supabase project, and Mailgun. It does not depend on the portal decision at all, so it starts today.

One correction to the brief: it gives "Saturday Sept 20" as an example. September 20, 2026 is a Sunday. The first bookable Saturday is September 19. All copy, tests, and calendar-file fixtures use September 19.

One choice the brief leaves open: line 5 puts the picker on its own `/book` page (noindex until cutover) and line 30 puts it inside the existing `#quizResult` card on `/assessment`. This plan uses the in-card option, because the parent has just submitted the form and is already looking at the result card, and a second page is one more place for a phone user to drop off. Until cutover it is tested on the branch deploy preview, so the live page is untouched. `/assessment/manage` is noindex.

### Phase 0: Build (2026-09-10 to 2026-09-16)

Owner: Playbook (Omar). Michael answers one question (blackout Saturdays).

Prerequisite: the booking functions need a Supabase service key and a Mailgun key as environment variables on the Valor Netlify site (`SUPABASE_*`, `MAILGUN_*`). Those have never been set on that site (the CAPI function is inert today for the same reason), so the first task is confirming who has Netlify admin on the Valor site and adding them.

Deliverables:
- Branch `booking/assessment-calendar`. The live `/assessment` form, the lead sync, the Lead pixel event, and the form name and field names are untouched until cutover (Netlify registers form fields from the HTML at deploy time, so the form name and field names cannot change; other markup can).
- `booking/slots.json`: Saturdays 10:00 to 13:00 Pacific, 30-minute slots, one athlete per slot, open through 2026-10-04, blackout list (empty until Michael answers).
- `assessment_bookings` table in the Playbook Supabase project, with the columns as the brief lists them (line 28): id, client_id, lead_id, slot_start, slot_end, requested_day, requested_window, note, athlete name, age, sport, parent name, phone, email, status (requested, booked, rescheduled, canceled, attended, no-show), manage_token, utm fields, created_at. No extra columns invented. Note for Phase 4: the coach console also wants the quiz result, which lives on the lead row, not the booking row, so the portal mirror needs the lead join.
- Two unique indexes, both from the brief: one on slot_start for booked rows (one athlete per slot, line 36) and one on slot plus parent email (stops a double tap creating two rows, line 26).
- Times stored in UTC, rendered in Pacific; `.ics` files carry a TZID (line 39).
- `booked_at`, `slot_start`, `slot_status` on the lead row. Leads tab in the Playbook portal shows requested vs booked vs attended, and has two actions: confirm a requested time (which calls the same book function, so a request converts to a booking through one path, line 27) and set attended or no-show. Until that is shipped, the manual path is Michael texts Omar and Omar sets it.
- Netlify functions: `assessment-slots`, `assessment-book` (checks capacity inside a transaction with the unique indexes above so two parents cannot take one slot), `assessment-request` (request a time), `assessment-manage` (reschedule and cancel), `assessment-status` (attended, no-show, confirm request; keyed, called by the Leads tab now and by the portal mirror in Phase 4), plus a scheduled evening function for the day-before reminder. Before promising the reminder, confirm scheduled functions are available on the Valor Netlify plan; the fallback is a Playbook-side job, which itself needs a place to run (a cron or edge function in the Playbook Supabase project, since Playbook's local scheduled tasks are currently run by hand).
- Nothing is held for a parent who never confirms: a slot is only taken when the book function commits the row (line 37).
- Slot picker inside the existing result card on `/assessment`, mobile-first, site fonts and red accent, with a request-a-time option and a confirmation card with Google and Apple calendar buttons. Bookings under 12 hours out are flagged short-notice on the row and in the Valor-side email (line 40). A parent who books twice is shown the existing booking and offered reschedule instead of a second row (line 41).
- No-pick path: if a parent submits the form and never picks a slot, the lead lands exactly as it does today and Valor texts them as they do now. The picker adds a step; it does not gate the lead.
- `/assessment/manage?t=<token>` page to reschedule or cancel; both send an updated email and an updated calendar file (line 29).
- Mailgun emails: parent confirmation with a calendar file attached (`METHOD:REQUEST`, Valor as organizer, line 26) and the manage link; Valor-side email to exactly the current Netlify form notification recipients (looked up, nobody added); request acknowledgment; reschedule and cancel updates; day-before reminder. Sender name Valor Sports Academy, reply-to the Valor Gmail. Check delivery to Gmail on the first real booking.
- Schedule pixel event on confirmation on both pixels; utm and fbclid carried onto the booking row.
- Tests: end to end on a real phone (ad to confirmed slot with calendar file in under three minutes), double-tap on the book button, two bookings for the same slot in the same second, same parent booking twice, a booking under 12 hours out, a request confirmed through the book function, reschedule and cancel emails and calendar files, a form submit with no slot picked still creating the lead, and the `.ics` opening correctly in Google Calendar and Apple Calendar with the right Pacific time.

Cutover: one change on the assessment result screen, target Wednesday 2026-09-16 evening or Thursday 2026-09-17, so Saturday 2026-09-19 is the first self-booked Saturday. Rollback is reverting that one change; the form, lead sync, and pixel events are the same before and after. If anything else lands on Omar that week, cutover slips one week and the first live Saturday is 2026-09-26.

### Phase 0b: First live Saturdays (2026-09-17 to 2026-10-03)

Owner: Playbook watches; Michael runs the Saturday assessments and reports no-shows.

- Monitor Saturdays 09-19, 09-26, and 10-03: bookings, requests, reminder sends, calendar accepts on Michael's side, Leads tab status.
- After the first Saturday, a short plain-English note to Michael and Corey: what booked, what was requested, anything to change.
- By 2026-09-30, Michael gives October and November Saturday availability so the calendar can be extended past 2026-10-04. Without this the calendar goes dark on October 5. Extending it is a `slots.json` change pushed by Omar; this is not affected by the GitHub token issue in section 5, which blocks only the site-editor publishing path.
- Rule: if no parent books in the first two Saturdays, that is an ad traffic question, not a calendar bug. Check ad delivery before touching the build.
- Until the portal's Phase 4, Michael confirms requested times and marks attended or no-show through the Playbook portal Leads tab actions above (or texts Omar until those ship). That is a second login for him; it goes away when the coach console arrives.

## 3. Workstream 2: the athlete portal

Timeline assumes one developer at roughly two focused days a week alongside ongoing agency work, one Base44 session that depends on Corey, a Thanksgiving week, and a two-week pilot with real families. Each phase is useful on its own if the next one slips.

### Phase 1: Discovery, Base44 audit, decisions (2026-09-14 to 2026-10-02)

Overlaps the booking build on purpose. This phase is meetings, answers, design, and empty scaffolding, not feature code, because late September and early October are already full on Playbook's side.

Owner: Playbook leads. Corey provides Base44 access. Michael and Corey make the decisions listed below.

Deliverables:
- Base44 walkthrough with Corey, to be booked for the week of 2026-09-14 (30 minutes, screen share). It answers what the repo cannot: app id and URL, whether the Base44 plan is currently paid at all and if so which plan and monthly cost, who owns and pays for the workspace (Corey personally or Valor), whether the app is published, who has logged in, whether registration is open to anyone, the permission rules on each data type, whether the AI label scanner has been used and what credits it burns, which git remote Base44 syncs from, whether Base44 offers a data export on that plan, whether the user list itself can be exported, and whether "In-Season I" is one shared set of records or a per-user copy (this decides how it is seeded in Phase 2). Written up as a one-page audit memo, facts only.
- Immediate safety action: if the audit shows records are readable app-wide (every screen in v1 loads every record with no per-person filter), then if the Base44 dashboard offers creator-scoped rules, set them that day; otherwise close self-registration that day. Nobody has seen the dashboard yet, so which of the two applies is unknown. Nobody new is invited into the hosted app before cutover.
- Data pulled out of Base44 while the app is still accessible: the "In-Season I" program rows and any real workout, nutrition, or 1RM logs. Only the program template is committed to the repo under `seed/`; any real athlete data goes to a Valor-owned location, not the repo, and the export path is documented.
- Base44 feature freeze from the sign-off date, in writing: no new features or data entered in Base44 after that date, so the final snapshot cannot miss anything.
- Owner interview (45 minutes, Michael and Corey): what exactly coaches want to add (assigned programs, notes, assessment results, attendance, nutrition targets, video), who logs in for a youth athlete, which coaches exist and whether any sees only a subset, whether a responsive web app is acceptable, and whether "In-Season I" is real programming or sample data Corey typed while building.
- Written data model and permission design, reviewed with Corey: people (role: athlete, guardian, coach), athletes, guardians, coach-to-athlete links (with a guardian consent record: checkbox text, timestamp, who accepted), program templates and their workouts, assigned workouts per athlete, workout logs, 1RMs, nutrition logs and macro goals (only if kept), coach notes, assessment results, and a bookings mirror keyed by the Playbook booking id.
- Decision record signed by Michael and Corey, containing: the platform decision, an ownership table (Supabase org, Netlify site, GitHub repo, DNS, Mailgun sending, LLM key, and the Google Cloud OAuth client that Google sign-in needs, which someone's Google account has to own, most likely Valor's), a plain-English maintenance agreement (Playbook owns schema, permissions, server functions, and anything touching minors' data; Corey may edit UI through pull requests with preview links), a monthly running cost estimate with who pays, and a one-page "if Playbook disappears" note.
- Empty scaffolding: Valor-owned Supabase project (Michael or Corey as org owner, Omar and Corey admins), GitHub repo, Netlify site attached, DNS request to Valor for the subdomain, and CI: a GitHub Actions workflow plus a test database (a Supabase branch or a local Postgres in the workflow) so the Phase 2 permission tests have somewhere to run on every pull request.
- Unblock the site-editor publishing path: Omar supplies the GitHub token the Valor site-editor server needs (per its ONBOARDING §1). This blocks Michael's edits through the site editor, not Omar's own git pushes.
- Known v1 bugs and dead code logged as tickets so nothing is lost in the port (listed in section 4).

Decisions the owners make before this phase closes: see section 6, items marked Phase 1.

### Phase 2: Foundation and port of the athlete side (2026-10-05 to 2026-10-23)

Starts after the Eagle Harbor October 1 go-live on Playbook's side.

Owner: Playbook builds. Corey reviews the ported screens on preview links and may open UI pull requests. Valor owns the Supabase org and DNS.

Sizing: at two days a week this phase is about six working days. The port of three screens alone is estimated at about a week full time before any new schema, so the phase only fits because Progress and Nutrition are deferred to Phase 4 and the CI and scaffolding are done in Phase 1. Slip rule: if the permission tests are not green by 2026-10-23, Phase 3 starts one week later and the pilot window (11-09 to 11-20) holds; the bug fixes listed below move to Phase 3 before the deployed screens do.

Deliverables:
- Supabase Auth: email and password, magic link for parents, Google sign-in (using the OAuth client from the Phase 1 ownership table). Invite-only. No open sign-up page.
- Database migrations for the Phase 1 data model, with permission policies on every table.
- Automated permission test matrix, run on every pull request (including Corey's) through the CI set up in Phase 1: athlete A cannot read athlete B; a guardian sees only linked athletes; a coach reads and writes only athletes assigned to them. Green tests are a hard requirement before any parent is invited. This is the proof for minors' data, not a dashboard setting.
- Port of the screens the coach loop needs: Home, Workouts, and the Start Workout session logger. The Base44 client file is replaced by a thin data layer over Supabase that mirrors the same list/filter/get/create/delete shape so the pages change minimally. Base44 packages, the Base44 build plugin (which reports usage back to Base44 and enables their visual editor), the unrouted OAuth consent page, and unused template packages (Stripe, three.js, maps, PDF, rich text editor) are removed.
- Progress (1RM) and Nutrition screens are ported in Phase 4, not here, unless the Phase 1 decision says nutrition and 1RM are required for the pilot. The owners asked for the coach loop, not a faithful re-port of the tracker. This deferral is what makes the phase fit.
- Fixes folded into the port: the current-week detection bug, custom workouts that cannot be started, the dashboard counting templates instead of completed sessions, missing error messages (v1 spins forever when a load fails), delete confirmations, a workout history view (v1 never shows one), a real manifest so the app installs to a phone home screen, Valor name and icon replacing "Base44 APP".
- "In-Season I" seeded from the Phase 1 export as one program template, not a hard-coded string. How it is seeded (one shared template vs per-athlete copies) follows the Phase 1 walkthrough answer.
- Deployed to the Valor subdomain as a separate Netlify site with preview links on pull requests. The public site's `netlify.toml`, edge function, and site-editor server are not touched. A short CONTRIBUTING note for Corey.

### Phase 3: Coach console and pilot (2026-10-26 to 2026-11-20)

Owner: Playbook builds. Michael and Corey act as the coaches and name pilot athletes. Parents of pilot athletes sign up.

Order inside the phase matters. The first two weeks (10-26 to 11-06) build only the loop: coach opens an athlete, assigns a workout or program, writes a note; athlete logs in, sees it, logs the session; coach sees the log. That goes into Corey's and Michael's hands by 2026-11-09 before anything else is polished, so the pilot start survives a slip elsewhere.

Deliverables:
- The loop above, first.
- Roster: athlete list and athlete profile (name, date of birth, sport, school or team, guardian contact, program enrollment, coach-only notes). Exact fields set in Phase 1.
- Invite flow: coach invites a guardian or athlete by email; the guardian-athlete link is created on accept; a family with several kids is several athlete rows under one guardian. On accept, the guardian sees a consent checkbox and the acceptance is recorded (checkbox text, timestamp, accepting user) on the guardian-athlete link. The wording and whether it is sufficient are for Valor's counsel (Q9); Playbook builds the record, not the legal position.
- Assign a program or single workout to an athlete (a dated copy of the template, per-athlete weight or intensity overrides).
- Assessment results entry with whatever metrics Michael names in Phase 1. If Valor cannot define the metric set by then, it ships as a free-form note plus a small set of numeric fields and gets refined with use, rather than blocking the console.
- Coach-set macro goals only if nutrition was kept.
- Coach view of an athlete's workout history (and 1RM chart once Progress is ported).
- Role-based navigation and a small admin screen for Michael and Corey to manage coaches.
- Pilot: 3 to 5 real athletes chosen by Michael, about 2026-11-09 to 2026-11-20, no public announcement. Michael texts pilot parents directly; do not rely on the app's invite email alone. A one-page feedback log lives in the repo; Michael prioritizes the fixes; that log is the gate into Phase 4.

### Phase 4: Bookings bridge, remaining screens, Base44 cutover (2026-11-23 to 2026-12-11)

Thanksgiving is Thursday 2026-11-26; the week of 11-23 counts as three working days. The Base44 cutover itself is scheduled for the week of 2026-12-07, off the holiday.

Owner: Playbook builds. Corey closes out Base44. Michael tests the booking flow from the coach side.

Deliverables:
- Bridge design, fixed now: the Playbook project stays the system of record for bookings (the Leads tab, reminders, and emails depend on it). The Valor project gets a read-only mirror plus status write-back. A keyed server-to-server sync (same pattern Playbook already runs for Netlify leads) copies bookings joined to their lead row into the Valor project; the coach console shows upcoming assessments with athlete, parent, quiz result (from the lead row), and source; marking attended or no-show, or confirming a requested time, goes back through the Playbook `assessment-status` function from Phase 0 so nothing drifts. Every sync run is logged and alerts on zero rows, like the existing syncs.
- Convert to athlete: one click on an attended booking creates the athlete profile and sends the guardian invite from the booking's parent email. Marking the lead as converted is a write into the Playbook project, and the leads table has no converted status today (it has qualified and canceled), so this needs a new column or status value on the Playbook side, added as part of this phase.
- Progress (1RM) and Nutrition screens ported from v1, if not already done in Phase 2. The AI label scanner is rebuilt as a Supabase function on an LLM key, or dropped, per the Phase 1 decision.
- Mailgun notifications from the Valor project: invite, new assignment, new coach note. Sender domain per Q14 in section 6, decided by 2026-11-20 (Playbook domain as bookings use today, or a Valor domain, which needs DNS on Valor's side).
- Meta: by default the app reports nothing to either Meta dataset. A server-side signup event is added only if the owners decide the event name and dataset(s). The app must not reuse the public site's thank-you paths, which fire Lead and CompleteRegistration.
- Base44 wind-down: final data pull, diffed against the Phase 1 export; any real logs loaded into the Valor project. Passwords will not move off any platform, and whether the user list itself exports is unknown until the Phase 1 walkthrough, so plan on anyone who used the hosted app re-registering through an invite, and the owners tell them ahead of time. Then Corey downgrades Base44 (to free, if that is what the plan allows) or deletes the app.
- Handover pack: CONTINUITY-style runbook (auth, permissions, functions, keys, how to add a coach, how to run the permission tests), credentials list held by Valor, the ownership table and monthly cost sheet from Phase 1 updated, the "if Playbook disappears" note, and a 30-minute walkthrough with Corey.

### Phase 5: Stabilize and backlog (2026-12-14 to 2026-12-23, rolls to the week of 2027-01-04 if needed)

Owner: Playbook. Michael and Corey confirm the backlog.

- Booking slot settings inside the coach console (open-through date, blackout dates, windows). The settings screen writes to a config row in Supabase that the Netlify booking functions read, with `slots.json` as the fallback, so slot changes do not need a code push from anyone. The site-editor publishing path (Michael's edits through the site editor) is blocked today on a GitHub token on Omar's side; unblocking it is a Phase 1 item and does not affect Omar's own pushes.
- Bug fixes from the first two weeks of general use.
- Written 2027 backlog: SMS reminders if no-shows are a problem, attendance and class scheduling, in-app messaging, native or installable app beyond the home-screen manifest, other coaches with subset rosters.
- Second signed-off note: what was built, monthly running cost (Supabase, Netlify, Mailgun, LLM if kept), who owns what.

## 4. What exists in v1 today

Location: `/Users/macuser/Documents/Claude/Projects/playbook/valor-sports-academy/valor-train-pro`, imported as-is in commit `ae608e9` on branch `product/valor-train-pro`.

- Stack: React 18.3.1, Vite 8.2.0, Tailwind 3.4, shadcn/Radix UI, react-router 6, `@base44/sdk` 0.8.48, `@base44/vite-plugin` 1.0.36, one Deno backend function. About 3,000 lines of hand-written code outside the shadcn `ui` folder (counts vary by what is included; three readings gave 2,900 to 3,200). About 40 places call the Base44 SDK across about 15 files (a grep for the SDK client gives 41 lines across 15 files).
- The whole backend is Base44: login, database, file upload, the AI call, hosting, and deploy. `src/api/base44Client.js` talks to a same-origin `/api` that only exists on Base44 hosting. `base44/config.jsonc` names the app "untitled"; the app id pointer `base44/.app.jsonc` is gitignored and absent. Running it locally needs the Base44 CLI, Deno, and a login to whoever's Base44 account it is linked to.
- Data types (six JSON schema files under `base44/entities/`): User (role: admin or user only), Workout (title, date, category, program, week, day, exercises with sets, reps, weight, % of 1RM), WorkoutLog, OneRepMax, NutritionLog, MacroGoal. No entity has an athlete, coach, guardian, or owner field. No permission rules are in the repo.
- Screens (`src/pages/`): Home (dashboard tiles), Workouts (hard-coded to a program named "In-Season I" at lines 28 and 30, plus custom workouts), WorkoutSession (timers, log sets), Nutrition (meals, macro goals, Scan Label via `base44/functions/scanNutritionLabel/entry.ts`, whose source is in the repo but which only runs on Base44 hosting), Progress (1RM entry and chart). Auth pages: Login, Register (open self-registration with email code), ForgotPassword, ResetPassword. `OAuthConsent.jsx` exists but is not routed.
- Every athlete-facing screen calls `entities.X.list()` with no per-user filter (`Home.jsx` 20-22, `Workouts.jsx` 24-26, `Nutrition.jsx` 41-42, `Progress.jsx` 33-34). Whether one athlete can see another's data depends on Base44 dashboard settings that are not in the repo. Unknown until the Phase 1 audit.
- The "In-Season I" program rows are not in the repo. They exist only in Base44's hosted database, if Corey entered them. Whether that is real programming or sample data, and whether it is one shared record set or per-user copies, is unknown.
- Build status: `npm run build` succeeds (917 kB bundle) but warns the app id is unset; `npm run lint` fails on two unused imports in `Home.jsx` line 5; `npm run typecheck` reports 237 errors, nearly all noise from untyped UI components.
- Real bugs (ticketed in Phase 1): `Workouts.jsx` lines 42-44 run `Math.min`/`Math.max` over date strings, which gives NaN, so the current week is never auto-selected; custom workouts render with no Start button (`Workouts.jsx` 119-148) so they cannot be logged; the dashboard "Total Workouts" counts workout templates, not completed sessions (`Home.jsx` 19-32); `index.html` links `/manifest.json` which does not exist; page loads have no error handling so a failed load spins forever; deletes have no confirmation; `WeeklyPlan.jsx` line 26 hard-codes "In-Season Plan, Phase Three".
- Branding: page title still "Base44 APP", Base44 favicon, sidebar text "VALOR / Sports Academy".
- Payments: Stripe packages are installed but no code uses them. Unknown whether that was intent or template leftovers.
- Nothing in v1 connects to the Valor website, the Playbook portal, the leads list, or the booking calendar.

## 5. Risks and how each is handled

| Risk | How it is handled |
|---|---|
| Athletes may be able to see each other's data in the hosted Base44 app today | Phase 1 audit in the week of 09-14; same day, creator-scoped rules if the dashboard offers them, otherwise registration closed; nobody new invited before cutover |
| Corey is the only person who can log into Base44; if the walkthrough slips, the export and the permission answer slip | To be booked for the week of 09-14, during the booking build; Phase 2 can start on the data model without the seed data |
| Base44 may offer no data export on Corey's plan | Fallback is a one-off script under Corey's login while the app is still accessible; must happen before any downgrade or deletion |
| Data created in Base44 after the export would be lost | Dated feature freeze in the decision record; final pull diffed against the Phase 1 export at cutover |
| Base44 user accounts may not move (passwords will not on any platform; whether the user list exports is unknown) | Plan on everyone re-registering through an invite; owners tell them in advance so adoption does not lag; the walkthrough checks whether the list exports |
| Permission mistakes with minors' data | Policies as code, per-role automated tests on every pull request, green tests required before any parent is invited |
| Login model for minors changes after permissions are written | Locked as a Phase 1 decision; default offered if the owners have no preference |
| Playbook's own calendar (Eagle Harbor Oct 1 go-live, investor work to mid-October) | Phase 1 has no feature code (meetings, design, empty scaffolding, tickets); feature code starts 10-05 |
| Phase 2 is tight at two days a week | Progress and Nutrition deferred to Phase 4; CI and scaffolding done in Phase 1; slip rule: Phase 3 starts a week later, pilot window holds |
| Booking cutover slips past 09-17 | First live Saturday becomes 09-26; the calendar itself does not change; rollback is reverting one change on the result screen |
| Valor Netlify site has no secrets set | Supabase and Mailgun env vars added as the first Phase 0 task; confirm who has Netlify admin |
| Calendar goes dark after 10-04 | Michael gives October and November availability by 09-30; Omar pushes the `slots.json` update (not blocked by the GitHub token issue) |
| Day-before reminder depends on Netlify scheduled functions | Verified on the Valor plan before it is promised; fallback is a cron or edge function in the Playbook Supabase project, not a local task |
| Scope creep on "things coaches add" | Fixed list at Phase 1; anything else goes to the written backlog, not Phase 3 |
| Assessment metric set undefined at Valor | Ship free-form note plus a few numeric fields; refine with use |
| Parents slow to accept invites during the pilot | Michael texts them; pilot start moves, pilot length does not |
| Two booking systems drifting apart | Playbook project is the single record; the portal mirror is read-only plus status write-back through the Playbook `assessment-status` function |
| Double-counting on two Meta pixels | App reports nothing to Meta until the owners decide event name and datasets |
| Thanksgiving inside Phase 4 | Week of 11-23 counted as three days; cutover set for the week of 12-07 |
| Holiday slowdown after 12-18 | Phase 5 may roll to the week of 2027-01-04; nothing in it is customer-facing on day one |
| The site-editor publishing path (Michael's edits) is blocked on a GitHub token | Unblocking the token is a Phase 1 deliverable; slot settings write to a Supabase config row so slot changes never need it; Omar's own pushes are not affected |
| Playbook is the maintainer of record (one person) | Plain repo Corey can edit, runbook, credentials held by Valor, "if Playbook disappears" note |
| AI label scanner carries a per-call cost the owners have not seen | Keep or drop decided in Phase 1; if kept, whose key and bill |
| Base44 pricing and plan status are unverified | Confirmed in the walkthrough; nothing in the cost comparison is final until then |

## 6. Open questions for Michael and Corey

Phase 0 (booking), Michael:
1. Which Saturdays through 2026-10-04 are out (camps, games)? Needed by 2026-09-15. The build does not wait on it.
2. October and November Saturday availability, by 2026-09-30.

Phase 0 (booking), Michael or Corey:
3. Who has admin on the Valor Netlify site, so the Supabase and Mailgun keys can be added.

Phase 1, Corey, week of 2026-09-14:
4. A 30-minute Base44 screen share to answer: app id and URL, whether the plan is paid at all and if so which plan and monthly cost, who owns and pays for the workspace, published or not, who has logged in, open registration or invite-only, permission rules per data type, whether any real athlete data exists, whether a data export is available on that plan, whether the user list can be exported, whether "In-Season I" is one shared record set or per-user copies, which git remote Base44 syncs from, label-scanner credit usage.
5. Is "In-Season I" real Valor programming or sample data?
6. Do you want to keep editing the UI yourself through pull requests, or hand the app fully to Playbook?

Phase 1, Playbook (Omar):
7. Supply the GitHub token the Valor site-editor server needs, so Michael's site edits can publish again.

Phase 1, Michael and Corey, by 2026-10-02:
8. Platform: port to a Valor-owned Supabase project (recommended) or stay on Base44. If Base44, the plan changes materially and Playbook cannot vouch for permissions on minors' data.
9. Ownership and billing of the Supabase org, Netlify site, GitHub repo, LLM key, and the Google Cloud OAuth client for Google sign-in. Recommendation: Valor owns, Omar and Corey are admins, Valor pays. Monthly cost ceiling.
10. Hostname: a subdomain such as app.valorsportsacademywa.com (recommended, needs one DNS record on Valor's side; the site domain itself is to be confirmed) or /app under the main domain.
11. Login model for youth athletes: parent holds the account with athlete sub-profiles, athletes log in themselves with parent visibility, or both. Default if no preference: parent-held for minors, athlete-held for adults, invite-only. Consent handling for minors is Valor's call to confirm with its own counsel, including the wording of the consent checkbox recorded on invite accept; this is not legal advice.
12. What coaches add to an athlete's portal, in priority order. Default minimum: assigned programs, coach notes, assessment results, workout history. Which assessment metrics are recorded.
13. Which coaches exist, whether any coach sees only a subset of athletes, and whether coaches also need logins in the Playbook marketing portal.
14. Keep or drop nutrition logging and the AI label scanner; keep 1RM as the progress model. If the scanner stays, whose LLM key and bill.

Phase 3, Michael, by 2026-10-23:
15. The 3 to 5 pilot athletes and their parents.

Phase 4, Michael and Corey, by 2026-11-20:
16. Transactional emails from the Playbook domain (as bookings do today) or a Valor domain (needs DNS). This is the sender-domain decision Phase 4 refers to.
17. Report athlete signups to Meta as server-side events on both datasets, one, or neither, and under which event name. Default is neither.
18. Confirm the final Base44 pull is done and set the date the Base44 app is downgraded or deleted.

Phase 5, by 2026-12-18:
19. Whether bookings stay in the Playbook project permanently with the bridge, or move into the Valor project. Recommendation: decide only after six or more weeks of real bookings.

## 7. Full timeline

| Phase | Start | End | Owner | Main deliverable | Owners decide before it |
|---|---|---|---|---|---|
| WS1 Phase 0: booking build | 2026-09-10 | 2026-09-16 | Playbook | Netlify secrets, slot picker, booking table with two unique indexes, functions incl. manage and status, Leads tab actions, emails, reminders; cutover 09-16 or 09-17 for Saturday 09-19 | Blackout Saturdays (config only); Netlify admin named |
| WS1 Phase 0b: first live Saturdays | 2026-09-17 | 2026-10-03 | Playbook watches, Michael runs | Monitoring, note after first Saturday, calendar extended past 10-04 | Oct and Nov availability by 09-30 |
| WS2 Phase 1: discovery and decisions | 2026-09-14 | 2026-10-02 | Playbook leads, Corey and Michael answer | Base44 audit and safety action, data export, feature freeze, data model, signed decision record with ownership and cost, empty scaffolding incl. CI, GitHub token unblocked, bug tickets | Platform, ownership, hostname, login model, what coaches add, nutrition keep or drop, Corey's role |
| WS2 Phase 2: foundation and athlete side | 2026-10-05 | 2026-10-23 | Playbook builds, Corey reviews | Auth, schema, tested permissions, port of Home, Workouts, session logger, bug fixes, deployed on the subdomain | DNS record placed |
| WS2 Phase 3: coach console and pilot | 2026-10-26 | 2026-11-20 | Playbook builds, Michael and Corey coach | Coach loop in hand by 11-09, roster, invites with consent record, assignments, notes, assessment results, pilot 11-09 to 11-20 with feedback log | Pilot athletes named; coach list confirmed |
| WS2 Phase 4: bridge, remaining screens, cutover | 2026-11-23 | 2026-12-11 | Playbook builds, Corey closes Base44 | Bookings mirror with status write-back, convert to athlete (new converted status on the Playbook lead), Progress and Nutrition ported, notifications, Base44 cutover week of 12-07, handover pack | Email domain, Meta events, Base44 shutdown date |
| WS2 Phase 5: stabilize | 2026-12-14 | 2026-12-23 (may roll to week of 2027-01-04) | Playbook | Slot settings in the console, fixes, 2027 backlog, signed close-out note | Where bookings live long term |

Total: about 15 weeks from 2026-09-10, with the booking calendar live in week one, the coach loop in Michael's and Corey's hands by 2026-11-09, real families on it from mid-November, and Base44 retired in early December.