// Saturday assessment slots, rendered in Pacific time. Mirrors the site's booking picker
// (10:00 to 13:00 PT, 30 minutes, one athlete per slot) and reads overrides from settings.
const TZ = 'America/Los_Angeles';

function tzOffsetMinutes(date, tz = TZ) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = Object.fromEntries(dtf.formatToParts(date).map((x) => [x.type, x.value]));
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return (asUTC - date.getTime()) / 60000;
}

/** Build a Date for a local (Pacific) wall-clock time on a YYYY-MM-DD day. */
export function localToDate(ymd, minutesFromMidnight) {
  const [y, m, d] = ymd.split('-').map(Number);
  const guess = new Date(Date.UTC(y, m - 1, d, Math.floor(minutesFromMidnight / 60), minutesFromMidnight % 60));
  const off = tzOffsetMinutes(guess);
  const fixed = new Date(guess.getTime() - off * 60000);
  const off2 = tzOffsetMinutes(fixed);
  return off2 === off ? fixed : new Date(guess.getTime() - off2 * 60000);
}

export function ymdInTz(date, tz = TZ) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day}`;
}

/** Returns [{ ymd, label, slots: [{ iso, label, taken }] }] for every open Saturday. */
export function buildDays(config, taken = [], now = new Date()) {
  const cfg = { weekday: 6, start_min: 600, end_min: 780, slot_min: 30, open_until: '2026-11-28', blackouts: [], tz: TZ, ...config };
  const takenSet = new Set((taken || []).map((t) => new Date(t).toISOString()));
  const days = [];
  const cursor = new Date(now);
  const end = new Date(cfg.open_until + 'T23:59:59');
  for (let i = 0; i < 120 && cursor <= end; i++) {
    const ymd = ymdInTz(cursor, cfg.tz);
    const dow = new Date(ymd + 'T12:00:00Z').getUTCDay();
    if (dow === cfg.weekday && !cfg.blackouts.includes(ymd)) {
      const slots = [];
      for (let m = cfg.start_min; m < cfg.end_min; m += cfg.slot_min) {
        const d = localToDate(ymd, m);
        if (d.getTime() <= now.getTime()) continue;
        const iso = d.toISOString();
        slots.push({ iso, label: fmtTime(d, cfg.tz), taken: takenSet.has(iso) });
      }
      if (slots.length) days.push({ ymd, label: fmtDay(new Date(ymd + 'T12:00:00Z')), slots });
    }
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

export const fmtTime = (d, tz = TZ) => new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: '2-digit' }).format(d);
export const fmtDay = (d) => new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(d);
export const fmtSlot = (iso, tz = TZ) => iso
  ? new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(iso))
  : 'Time to be confirmed';
export const money = (cents, currency = 'usd') => new Intl.NumberFormat('en-US', { style: 'currency', currency: currency.toUpperCase() }).format((cents || 0) / 100);
