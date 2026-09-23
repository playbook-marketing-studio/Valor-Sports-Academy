/**
 * Latest max per lift for one athlete, as { 'Back squat': 245, ... }.
 * athleteId set: that athlete's maxes. athleteId null: the account holder's own (rows with no athlete).
 */
export function latestMaxes(maxes, athleteId) {
  const best = {};
  (maxes || []).filter((m) => (athleteId ? m.athlete_id === athleteId : !m.athlete_id)).forEach((m) => {
    if (!best[m.exercise_name] || m.date > best[m.exercise_name].date) best[m.exercise_name] = m;
  });
  return Object.fromEntries(Object.entries(best).map(([k, v]) => [k, v.weight]));
}
