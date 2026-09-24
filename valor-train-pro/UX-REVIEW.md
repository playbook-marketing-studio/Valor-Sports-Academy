# Valor Train Pro · UX review

9/24/2026. Reviewed as staff (laptop and phone) and as a parent (phone), on the seeded demo, with the Impeccable design-review method (Nielsen heuristics, persona walk-throughs, automated slop detector). The product brief is in `PRODUCT.md`: the gym floor on a phone is the primary context for staff.

## Score

| # | Heuristic | Score | Key issue |
|---|---|---|---|
| 1 | Visibility of system status | 2 | Class log rows save silently on blur; staff have no "today" view of what's happening |
| 2 | Match with the real world | 3 | Uses Corey's words (primary, superset, "3 x 55%"), but parents see "1RM" and a fitness-app dashboard |
| 3 | User control and freedom | 3 | Undo on payments and statuses; archive instead of delete |
| 4 | Consistency and standards | 2 | Staff land on a parent dashboard; eyebrow styles, card titles and intro copy vary by page |
| 5 | Error prevention | 2 | "Check in" offered on a family that only asked for a time; Enroll button silently disabled |
| 6 | Recognition rather than recall | 2 | Class log always opens on week 1 / first day; staff must know which week it is |
| 7 | Flexibility and efficiency | 2 | Phone class log is a wide spreadsheet; five taps to reach today's class |
| 8 | Aesthetic and minimalist design | 2 | Slogan hero on every home screen, long page intros, meaningless stats ("Calories today 0") |
| 9 | Error recovery | 3 | Clear error toasts; expired login link explains itself |
| 10 | Help and documentation | 2 | Inline hints exist; no guidance on first run for staff |
| | **Total** | **23/40** | **Workable, not yet gym-floor ready** |

**Looks AI-generated?** Mostly no. The brand (Anton, the emblem, ink and red) carries it, and the detector found 0 issues across 30 files. The remaining tells are structural: a slogan hero on the home screens, a row of three stat cards over three nav cards, and red tracked eyebrows ("ASSESSMENT · 9/19/2026", "AGE 13 · FOOTBALL") on nearly every card.

## What's working
- **The assessment-day page is a real sequence.** Results, then parent login, then payment, numbered because it actually is an order.
- **Targets in the gym's own language.** "3 x 55%" becomes each kid's weight from their own max. It reads like Corey's sheet, but does his math.
- **Nothing gets lost.** Undo on payments, archive instead of delete, and program changes never overwrite logged workouts.

## Priority issues

1. **[P0] Parents can't pay from their phone.** "Enroll and pay" on the parent home is permanently disabled. It picks its default before the price list loads and never updates. *Fix:* re-derive the default when the list arrives.
2. **[P1] Staff land on a parent fitness dashboard.** Coaches open the app to "Train with purpose", "Calories today 0" and their own nutrition, with no view of today's assessments or classes. *Fix:* a staff **Today** screen with this Saturday's assessments, requests to text back, today's classes linked straight into the class log, and follow-ups (assessed, not enrolled). Remove the parent-only pages from the staff nav.
3. **[P1] The class log doesn't work on a phone, and opens on week 1.** On a phone it's a sideways-scrolling spreadsheet with two columns visible, and staff must know the week number. *Fix:* on a phone, one card per athlete with exercises stacked. Open on today's day and the program's current week. Show a visible "Saved" per athlete.
4. **[P1] The wrong action on a time request.** A family who asked for "Thursday after 6" gets a red **Check in** button. *Fix:* the primary action is **Text to set a time**, with **Book a time** to turn the request into a booking once they agree.
5. **[P2] The athlete page is cramped on a phone.** Four header buttons and four tabs wrap onto two lines each, and the Enrollment step is three screens down. *Fix:* call and text stay as icons, Edit and Archive go in a menu, and the tabs scroll in one line. Add a deep link to a tab.
6. **[P2] Parent home leads with a slogan and hollow stats.** The first screen a parent sees is the website slogan, then "Total workouts 48 / Calories today 0 / Top 1RM". *Fix:* lead with each kid's **next workout** (or the enroll step), and drop the stat and nav cards the menu already covers.

## Persona red flags
- **Corey on the gym floor (phone, one hand, parents waiting):** Five taps to reach today's class log. Then week 1 instead of week 5. Then a grid where he scrolls sideways for every kid. The icon buttons are 32px, below the 44px touch target.
- **Dana, a parent at home in the evening:** Taps "Enroll and pay" and nothing happens (P0). The Progress page opens on a five-field "Log Core Lifts" form, and says "1RM" without explaining it.
- **Michael checking in on Saturday:** A time request shows **Check in** as the main button. The staff home says "Good afternoon, Coach" over a fitness dashboard, not his Saturday list.

## Minor observations
- **Faux bold on names.** Athlete names on cards render as synthesized bold of Anton, which only has one weight, and the letters smear.
- **Intros too long.** Every staff page opens with a two- or three-line explanation. One line, or none, once people know the app.
- **Placeholder looks like a saved password.** The password field's "••••••••" placeholder reads as already filled in.
- **Unhelpful class log hints.** Cells with no max say "lb"; they should show the target ("x10", "Bodyweight") instead.
- **Uppercase wraps badly.** The section subtitle "· TEXT THEM TO SET ONE" is uppercase and wraps on a phone.
- **Progress chart.** On the parent Progress page, the "Strength progress" chart with one test date is a column of dots.

## Fixed (9/24/2026, same day)

| Issue | What changed |
|---|---|
| P0 Parents can't pay | The Enroll button picks up the recommended class or pack once prices load. Verified: "Enroll and pay · $199.00" is active for an unenrolled parent. |
| P1 Staff land on a parent dashboard | New **Today** screen is the staff home. It shows classes today with logged counts, linked into the class log. It also shows the next assessment day with times and status, requests waiting on a text (with a prefilled text), and assessed kids who haven't enrolled (with a text button). The parent-only pages are gone from the staff menu. |
| P1 Class log on a phone | Phones get one card per athlete with exercises stacked and 44px inputs; laptops keep the grid. It opens on the program with a class today, today's day or the most recent one, and the program's current week. Each athlete shows Saving… / Saved / Not saved. Hints show the target when there's no max ("x10", "60%"). |
| P1 Wrong action on a time request | Requests show **Text to set a time**, with a prefilled message, and **Book a time**, which turns the request into a booking and warns if the slot is taken. There's no Check in button on a request. |
| P2 Athlete page cramped on a phone | Name first, details under it. Call and text are icons, then Edit, then a More menu with Add a sibling and Archive. Tabs scroll in one line and deep-link (`?tab=training`). |
| P2 Parent home | A greeting, then **Next up**: each enrolled kid's next workout, one tap to start. Then their results and enrollment. The slogan hero, stat cards and nav cards are removed. |
| Minor | Anton no longer fakes a bold (`font-synthesis: none`). Eyebrows became plain muted text. Page intros are one line. The password placeholder dots are gone. Progress says "max lifts", not "1RM", and the bulk lift form is collapsed at the bottom. Tap targets on booking rows are 40-44px. Request dates read "Thu, Oct 1". |

**Not changed:** the Progress chart with a single test date, and a first-run guide for staff. Both are worth doing once there's real data.
