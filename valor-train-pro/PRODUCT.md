# Product

> Drafted 9/24/2026 from the repo (ROADMAP, HANDOVER-DRAFT, Corey's tracking workbook) and Omar's direction in the build conversation. Not yet confirmed line by line with Omar; edit freely.

## Register

product

## Users
- **Valor staff (Corey, Michael, coaches):** run Saturday assessments and weekday classes at the gym in Richland, WA. Mostly on a phone or iPad on the gym floor, standing, between athletes, often one-handed, with parents waiting. Also at a laptop for planning (writing programs, reviewing the roster). Today they run everything from an Excel workbook, texts and paper cards.
- **Parents of athletes (ages 8-18):** arrive cold from a Meta ad, book a free assessment on the website, then get a login from a coach at the gym. On their phone, occasionally. They check results, their kid's workouts, and pay.
- **Athletes:** log workouts on a parent's phone today; their own logins are v1.1.

## Product Purpose
Replace Valor's workbook, texts and paper with one place: website bookings arrive in the app, coaches run the assessment and record results, parents get a login on the spot, families pay for a class or pack (cash, Venmo or card by QR), and coaches assign Corey's programs and log what each kid lifted. Success: Corey stops opening Excel, a parent can go from "we're here" to "logged in and paid" at the front desk in under two minutes, and no booking or payment lives only in someone's texts.

## Brand Personality
Valor Sports Academy: "Train With Purpose. Rise With Valor." Direct, coach-like, confident, family-facing. Three words: disciplined, warm, no-nonsense. Carries the website's identity (Anton display, Hanken Grotesk, ink + brand red, the lion emblem) without turning the tool into a marketing page.

## Anti-references
- Anything that "looks AI built" (Omar's words): generic SaaS dashboards, identical card grids, gradient heroes, tracked uppercase eyebrows everywhere.
- The Base44 export this replaced (amber-on-charcoal template look).
- Enterprise gym-management suites that bury the one action a coach needs under menus.

## Design Principles
1. **The gym floor is the primary context.** Every staff action that happens during a class or assessment must work on a phone, one-handed, in a few taps.
2. **Say it the way the gym says it.** Corey's words (primary, superset, "3 x 55%", drop-in, class pack), not software words.
3. **Show the next step.** Each screen makes the obvious next action for that person and moment the most visible thing.
4. **Parents see progress, not admin.** The parent view is about their kid; staff mechanics stay out of sight.
5. **Nothing is lost.** Undo instead of delete, logs are never overwritten by program changes, and every state change is visible.

## Accessibility & Inclusion
WCAG 2.2 AA. Large tap targets for gym-floor use (44px). Readable in bright gyms (strong contrast, no light gray body text). Respect reduced motion. Parents span a wide range of tech comfort; no jargon.
