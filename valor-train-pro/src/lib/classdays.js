// Class days (Corey 11/24/2026: "they can select which days on their end and then we know which kid is coming
// on which day"). Stored on athletes.class_days in the format staff already type: "Mon / Wed (PM1)".
// The weekly schedule comes from settings.class_schedule; this default is the winter 2026 schedule.
export const DEFAULT_SCHEDULE = {
  days: ['Mon', 'Tues', 'Wed', 'Thurs', 'Fri'],
  slots: [
    { key: 'AM', time: '5:30 to 6:45 AM', who: 'Mornings' },
    { key: 'PM1', time: '3:30 to 4:45 PM', who: 'Middle and high school' },
    { key: 'PM2', time: '4:45 to 6:00 PM', who: 'Elementary' },
    { key: 'PM3', time: '6:00 to 7:00 PM', who: 'All ages' },
  ],
};
export const scheduleFrom = (raw) => (raw && Array.isArray(raw.days) && Array.isArray(raw.slots) && raw.slots.length ? raw : DEFAULT_SCHEDULE);

const ALIASES = { mon: 'Mon', monday: 'Mon', tue: 'Tues', tues: 'Tues', tuesday: 'Tues', wed: 'Wed', weds: 'Wed', wednesday: 'Wed', thu: 'Thurs', thur: 'Thurs', thurs: 'Thurs', thursday: 'Thurs', fri: 'Fri', friday: 'Fri', sat: 'Sat', saturday: 'Sat', sun: 'Sun', sunday: 'Sun' };

/** "Tues / Thurs (AM)" → { days: ['Tues','Thurs'], slot: 'AM' }. Best effort on what staff typed. */
export function parseClassDays(text) {
  const s = String(text || '');
  const slot = (s.match(/\(([^)]+)\)/) || [])[1]?.trim().toUpperCase() || '';
  const days = [...new Set(s.replace(/\([^)]*\)/g, ' ').split(/[^A-Za-z]+/).map((w) => ALIASES[w.toLowerCase()]).filter(Boolean))];
  return { days, slot };
}
export const formatClassDays = (days, slot) => `${days.join(' / ')}${slot ? ` (${slot})` : ''}`;

/** "Mon and Wed, 3:30 to 4:45 PM" for families. */
export function describeClassDays(text, schedule) {
  const { days, slot } = parseClassDays(text);
  if (!days.length) return text || '';
  const sl = scheduleFrom(schedule).slots.find((x) => x.key === slot);
  const list = days.length > 1 ? `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}` : days[0];
  return `${list}${sl ? `, ${sl.time}` : slot ? ` (${slot})` : ''}`;
}

/** Today's weekday in Valor's format, Pacific time. */
export function todayKey() {
  const w = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Los_Angeles', weekday: 'long' }).format(new Date());
  return ALIASES[w.toLowerCase()];
}

/** Days a week for a monthly plan item (4 classes a month = 1x a week). null when there's no fixed number. */
export const perWeek = (item) => (item?.billing === 'monthly' && item.classes ? Math.max(1, Math.round(item.classes / 4)) : null);
