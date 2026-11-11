// Valor's calendar day is Pacific time, whatever the phone or the server clock says.
// 11/10/2026: "today" used to be new Date().toISOString().slice(0, 10), which is the UTC date, so from 4pm Pacific
// (5pm in summer) the app thought it was already tomorrow: today's workout dropped off Home at the evening class
// and logs were dated a day ahead.
const TZ = 'America/Los_Angeles';
const dtf = new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' });

/** 'YYYY-MM-DD' in Pacific time for a Date (default now). */
export function ymdPT(d = new Date()) {
  const p = Object.fromEntries(dtf.formatToParts(d).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}
/** Today's date at Valor, 'YYYY-MM-DD'. */
export const todayPT = () => ymdPT();
/** Calendar math on a 'YYYY-MM-DD' string (noon UTC, so DST never moves the day). */
export const addDaysYmd = (ymd, n) => { const d = new Date(`${ymd}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** 1 = Monday ... 7 = Sunday for a 'YYYY-MM-DD' string. */
export const weekdayOf = (ymd) => ((new Date(`${ymd}T12:00:00Z`).getUTCDay() + 6) % 7) + 1;
