# Valor Train Pro · demo script

About 10 minutes. Staff on a laptop or iPad, parent on a phone. Demo families use `@valortrainpro.test` emails, and none of them get emailed.

## Before the demo

Reset to a clean demo. It purges demo data and reseeds, with dates relative to the next Saturday:

```bash
set -a; source ~/Documents/Claude/Projects/playbook/.env; set +a
DEMO_PASSWORD='<pick one>' node scripts/demo-data.mjs seed
```

Logins:
- **Staff:** your own allowlisted email (omar@, Corey, Michael) or `admin-test@valortrainpro.test`.
- **Demo parents**, both using the `DEMO_PASSWORD` you used:
  - `dana.hill@valortrainpro.test`: enrolled, so everything is unlocked.
  - `kim.brown@valortrainpro.test`: not enrolled, so content is locked.

What the seed creates:

| Who | Stage | Shows off |
|---|---|---|
| Liam, Sophia, Jaylen, Emma | Booked next Saturday (from the website, Meta / IG / Google) | Saturday list, check-in, ad source |
| Noah | Booked the Saturday after | Future days |
| Ava | Asked for a different time | Time requests, text-to-confirm |
| Marcus (Dana Hill) | Assessed last Saturday, parent active, 8-class pack by card with 2 used, 2 weeks of workouts, maxes | Everything after enrollment, class visits |
| Tyler (Marcus's brother) | Walk-in last Saturday, 4-class pack paid in cash | Walk-ins, siblings, staff marking paid |
| Ethan (Kim Brown) | Assessed, login sent, NOT enrolled; the coach already built a workout | The lock, and the follow-up case |
| Chloe | No-show | No-shows |

## The walkthrough

1. **A booking comes in.** Show the site's assessment form, then say: "the moment they pick a Saturday it lands here." Open **Assessments**: next Saturday's list, the Meta and Instagram tags, and Ava's request at the top with the text button.
2. **Saturday morning: check in Liam.** Tap **Check in** and his page opens.
3. **Record the assessment.** Enter the five test numbers, what to work on first, the class that fits, and a note. Tap **Save results**.
4. **Give the parent their login.** Tap **Get parent login** and a QR code appears. Scan it with your phone, set a password, and Liam's results are already there.
5. **Enroll them.** Pick a class or pack (one time); content is included while it's active.
   - **Card:** tap **show QR to scan** and the parent pays on their phone. This needs Stripe keys; until then it says not connected.
   - **Cash:** tap **Paid cash** and they're enrolled.
   - **Class visits:** on Marcus, tap **Log a class visit** and the classes-left count drops. When a pack runs out, the family's content locks until they buy more.
   - **Show the lock:** log in as Kim. Workouts shows "Unlocks with enrollment". Mark Ethan paid as staff, refresh Kim's screen, and his coach's workout appears.
6. **A walk-in shows up.** On **Assessments**, tap **Walk-in**. Enter the kid and parent and tap **Add and check in**, and you're on their page. Use Dana's email to show that a sibling links to the existing parent login automatically.
7. **After they sign up: the coach's side.** Open **Athletes**, then **Marcus**:
   - **Profile:** edit details, add a sibling, archive.
   - **Training:** the week 1 and 2 workouts, with a check mark on what Marcus logged. Tap **New workout**, or **Copy to week 3**.
   - **Progress:** test results over time and max lifts. Add a max, and the targets on his workouts update.
8. **The parent's side.** Log in as Dana on a phone:
   - **Home:** all three kids, their results and their programs.
   - **Workouts:** Marcus's plan from the coach, with target weights from his own maxes. Tap a workout to log it; the coach sees the check mark.
   - **Progress:** per-kid lifts.
9. **The roster.** On **Athletes**, filter by Booked, Assessed (the follow-ups), Enrolled or Archived.

Afterwards, run `node scripts/demo-data.mjs purge` to remove every demo family.
