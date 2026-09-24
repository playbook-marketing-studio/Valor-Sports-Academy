// Program templates (Corey's workbook, imported) → per-athlete workouts.
import { supabase } from '@/api/supabaseClient';

import { buildWorkouts } from './programs-core.js';
export { weekdayName, nextMonday, mondayOf, parsePrescription, parseTarget, exercisesFor, buildWorkouts } from './programs-core.js';

/** Put athletes on a program. Returns { assigned, skipped } (skipped = already on it). */
export async function assignProgram(template, athleteIds, startMonday, weekdayOverrides = {}) {
  const { data: existing } = await supabase.from('program_assignments').select('athlete_id').eq('template_id', template.id).in('athlete_id', athleteIds);
  const already = new Set((existing || []).map((r) => r.athlete_id));
  let assigned = 0;
  for (const aid of athleteIds) {
    if (already.has(aid)) continue;
    const { data: asg, error } = await supabase.from('program_assignments')
      .insert({ template_id: template.id, athlete_id: aid, start_date: startMonday, day_weekdays: weekdayOverrides }).select('id').single();
    if (error) throw error;
    const { error: e2 } = await supabase.from('workouts').insert(buildWorkouts(template, aid, asg.id, startMonday, weekdayOverrides));
    if (e2) { await supabase.from('program_assignments').delete().eq('id', asg.id); throw e2; }
    assigned++;
  }
  return { assigned, skipped: already.size };
}

/** The coach's own log for a workout (one per workout per coach), or null. */
export async function coachLogFor(workoutId, userId) {
  const { data } = await supabase.from('workout_logs').select('*').eq('workout_id', workoutId).eq('owner_id', userId).order('created_at', { ascending: false }).limit(1).maybeSingle();
  return data;
}
/** Save "weight used" per exercise for a workout, as the signed-in coach. entries: { exerciseName: { weight, reps, notes } } */
export async function saveCoachLog(workout, userId, entries) {
  const logged = workout.exercises.map((e) => ({ name: e.name, sets: e.sets, reps: entries[e.name]?.reps ?? e.reps, weight: entries[e.name]?.weight ?? null, notes: entries[e.name]?.notes || '' }))
    .filter((e) => e.weight != null && e.weight !== '' || e.notes);
  const existing = await coachLogFor(workout.id, userId);
  const values = { owner_id: userId, athlete_id: workout.athlete_id, workout_id: workout.id, workout_title: workout.title, date: workout.date, week: workout.week, day: workout.day, logged_exercises: logged };
  const res = existing ? await supabase.from('workout_logs').update(values).eq('id', existing.id) : await supabase.from('workout_logs').insert(values);
  if (res.error) throw res.error;
  return logged.length;
}
