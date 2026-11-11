// Pacific wall time <-> UTC for the facility calendar. Every block is entered and shown in Pacific time.
export const TZ = "America/Los_Angeles";

const dtf = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

/** The Pacific date (YYYY-MM-DD) and minutes since midnight of an instant. */
export function partsPT(d: Date): { ymd: string; min: number } {
  const p = Object.fromEntries(dtf.formatToParts(d).map((x) => [x.type, x.value]));
  return { ymd: `${p.year}-${p.month}-${p.day}`, min: Number(p.hour) * 60 + Number(p.minute) };
}

/** The instant of a Pacific date + minutes since midnight (1440 = midnight at the end of that day). */
export function ptToUtc(ymd: string, min: number): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  const wall = Date.UTC(y, m - 1, d, 0, min);
  const offsetAt = (t: number) => {
    const p = partsPT(new Date(t));
    const [yy, mm, dd] = p.ymd.split("-").map(Number);
    return Date.UTC(yy, mm - 1, dd, 0, p.min) - t;
  };
  let t = wall - offsetAt(wall);
  t = wall - offsetAt(t); // second pass settles the hours around a daylight-saving change
  return new Date(t);
}

export function isYmd(s: unknown): s is string {
  if (typeof s !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d;
}

export function addDays(ymd: string, n: number): string {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** 1 = Monday ... 7 = Sunday */
export const weekdayOf = (ymd: string) => ((new Date(`${ymd}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;

export function fmtMin(min: number): string {
  const h = Math.floor(min / 60) % 24, m = min % 60;
  return `${((h + 11) % 12) + 1}${m ? `:${String(m).padStart(2, "0")}` : ""}${h < 12 ? "am" : "pm"}`;
}

export function fmtDay(ymd: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" }).format(new Date(`${ymd}T12:00:00Z`));
}

/** "Wed, Nov 18, 7pm to 8pm" */
export function fmtRange(start: Date | string, end: Date | string): string {
  const a = partsPT(new Date(start)), b = partsPT(new Date(end));
  return `${fmtDay(a.ymd)}, ${fmtMin(a.min)} to ${fmtMin(b.min === 0 ? 1440 : b.min)}`;
}
