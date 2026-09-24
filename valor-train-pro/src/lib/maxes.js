/**
 * Latest max per lift for one athlete, as a lookup where maxes['Hang Clean'] === maxes['hang clean'].
 * athleteId set: that athlete's maxes. athleteId null: the account holder's own (rows with no athlete).
 * Lift names come from coaches typing them, so matching ignores case and extra spaces.
 */
const norm = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
export function latestMaxes(maxes, athleteId) {
  const best = {};
  (maxes || []).filter((m) => (athleteId ? m.athlete_id === athleteId : !m.athlete_id)).forEach((m) => {
    const k = norm(m.exercise_name);
    if (!best[k] || m.date > best[k].date) best[k] = m;
  });
  const map = Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.weight]));
  return new Proxy(map, { get: (t, k) => (typeof k === 'string' ? t[norm(k)] : undefined) });
}
