// Pure helpers (no Supabase import) so scripts/demo-data.mjs can reuse them in Node.
const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
export const weekdayName = (n) => WEEKDAYS[(n - 1 + 7) % 7];
const addDays = (ymd, n) => { const d = new Date(ymd + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

/** Monday on or after today (local), as YYYY-MM-DD. */
export function nextMonday(from = new Date()) {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const add = (8 - d.getDay()) % 7;
  d.setDate(d.getDate() + add);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** Snap any date to the Monday of its week. */
export function mondayOf(ymd) {
  const d = new Date(ymd + 'T12:00:00Z');
  return addDays(ymd, -((d.getUTCDay() + 6) % 7));
}

/** "primary - 5x3-5" → { sets: 5, reps: 3 }. Ranges keep the first number. */
export function parsePrescription(p = '') {
  const m = p.match(/(\d+)(?:\s*-\s*\d+)?\s*x\s*(\d+)/i);
  return m ? { sets: Number(m[1]), reps: Number(m[2]) } : {};
}
/** "3 x 55%" / "x5 @ 55%" / "x10" / "x5 ea" → { reps, intensity }. Anything else stays text only. */
export function parseTarget(t = '') {
  let m = t.match(/^(\d+)\s*x\s*(\d+(?:\.\d+)?)\s*%$/i);
  if (m) return { reps: Number(m[1]), intensity: Number(m[2]) };
  m = t.match(/^x\s*(\d+)\s*@\s*(\d+(?:\.\d+)?)\s*%/i);
  if (m) return { reps: Number(m[1]), intensity: Number(m[2]) };
  m = t.match(/^x\s*(\d+)(\s*ea)?$/i);
  if (m) return { reps: Number(m[1]) };
  return {};
}

/** Exercises for one template day in one week, in the shape workouts.exercises uses. */
export function exercisesFor(day, week) {
  return (day.exercises || []).filter((e) => (e.weeks || []).includes(week)).map((e) => {
    const target = (e.targets || {})[String(week)] || '';
    const pre = parsePrescription(e.prescription);
    const tg = parseTarget(target);
    return {
      name: e.name, group: e.group, prescription: e.prescription, target,
      sets: pre.sets ?? null, reps: tg.reps ?? pre.reps ?? null, intensity: tg.intensity ?? null, weight: null,
      notes: target && tg.intensity == null && tg.reps == null ? target : '',
    };
  });
}

/** Workout rows for one athlete: every week × every day, dated from the start Monday. */
export function buildWorkouts(template, athleteId, assignmentId, startMonday, weekdayOverrides = {}) {
  const rows = [];
  for (let w = 1; w <= template.weeks; w++) {
    for (const day of template.days) {
      const exercises = exercisesFor(day, w);
      if (!exercises.length) continue;
      const weekday = Number(weekdayOverrides[day.key] || day.weekday || 1);
      const block = (day.exercises.find((e) => (e.weeks || []).includes(w)) || {}).block || '';
      rows.push({
        athlete_id: athleteId, template_id: template.id, assignment_id: assignmentId, day_key: day.key,
        program: template.name, week: w, day: weekdayName(weekday),
        date: addDays(startMonday, (w - 1) * 7 + (weekday - 1)),
        title: `${day.label.replace(/\s*\(.*\)$/, '')}${block ? ` · ${block}` : ''}`,
        category: block || 'Strength',
        description: [day.warmup, day.cue ? `Coach's cue: ${day.cue}` : '', day.finish].filter(Boolean).join('\n\n') || null,
        exercises,
      });
    }
  }
  return rows;
}

