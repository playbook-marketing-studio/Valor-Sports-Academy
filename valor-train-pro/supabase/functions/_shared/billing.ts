// Monthly autopay rules (Corey 10/19/2026), shared by fn staff (checkout) and stripe-webhook (renewals).
//   - everyone is charged on the 1st, 9am Pacific (billing_cycle_anchor)
//   - mid-month sign-up: first payment covers the rest of the month, either Stripe's exact
//     proration ("prorate", default) or a flat half price ("half"); settings.enrollment.monthly.first_month
//   - first-month classes = the plan's classes per week x the weeks left in the month
//   - 3-month commitment, no fee: a parent can cancel in the app after 3 paid months; coaches any time
import type { EnrollmentConfig, Item } from "./common.ts";

export const TZ = "America/Los_Angeles";
export const CHARGE_HOUR = 9;
export const GRACE_DAYS = 3; // a month's classes stay usable 3 days past the next charge, so a slow renewal never locks anyone out

export type MonthlySettings = { first_month: "prorate" | "half"; commitment_months: number };
export function monthlySettings(cfg: EnrollmentConfig & { monthly?: Partial<MonthlySettings> }): MonthlySettings {
  const m = cfg.monthly || {};
  return {
    first_month: m.first_month === "half" ? "half" : "prorate",
    commitment_months: Number.isFinite(Number(m.commitment_months)) ? Math.max(0, Number(m.commitment_months)) : 3,
  };
}
export const isMonthly = (item?: Item & { billing?: string }) => item?.billing === "monthly";

/** Pacific calendar parts of an instant. */
function ptParts(d: Date) {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-US", { timeZone: TZ, year: "numeric", month: "numeric", day: "numeric", hour: "numeric", hourCycle: "h23" })
    .formatToParts(d).filter((x) => x.type !== "literal").map((x) => [x.type, Number(x.value)]));
  return { y: p.year, m: p.month, d: p.day, h: p.hour };
}
/** The UTC instant for a Pacific wall-clock time (handles PDT/PST). */
export function ptToUtc(y: number, m: number, d: number, h: number) {
  let t = Date.UTC(y, m - 1, d, h + 8); // PST guess
  const got = ptParts(new Date(t));
  t -= (got.h - h) * 3600000; // PDT is one hour ahead of the guess
  return new Date(t);
}

/** Next charge date: the 1st of next month at 9am Pacific, or null when signing up on the 1st (start now, renew on the 1st). */
export function nextAnchor(now = new Date()): Date | null {
  const p = ptParts(now);
  if (p.d === 1) return null;
  const y = p.m === 12 ? p.y + 1 : p.y, m = p.m === 12 ? 1 : p.m + 1;
  return ptToUtc(y, m, 1, CHARGE_HOUR);
}

/** Classes for the partial first month: classes per week x weeks left (rounded up), at least 1, at most the full month. */
export function firstMonthClasses(classesPerMonth: number | null, now = new Date(), anchor = nextAnchor(now)) {
  if (classesPerMonth == null) return null;
  if (!anchor) return classesPerMonth;
  const daysLeft = Math.max(1, Math.ceil((anchor.getTime() - now.getTime()) / 86400000));
  const perWeek = classesPerMonth / 4;
  return Math.min(classesPerMonth, Math.max(1, Math.round(perWeek * Math.ceil(daysLeft / 7))));
}

export const coverUntil = (periodEnd: Date) => new Date(periodEnd.getTime() + GRACE_DAYS * 86400000).toISOString();
export const fmtDayPT = (d: Date | string) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" }).format(new Date(d));
