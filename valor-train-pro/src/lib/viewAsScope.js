import { supabase } from '@/api/supabaseClient';

const SORT_ALIASES = { created_date: 'created_at', updated_date: 'updated_at' };
function applySort(q, sort) {
  if (!sort) return q;
  const desc = sort.startsWith('-');
  let col = desc ? sort.slice(1) : sort;
  col = SORT_ALIASES[col] || col;
  return q.order(col, { ascending: !desc });
}

/**
 * Read-only stand-in for base44.entities.<Table> (list/filter/get), scoped
 * explicitly to ONE athlete instead of relying on RLS. An admin's own RLS
 * (is_admin()) sees every row in the gym, so "view as athlete" has to filter
 * by hand — and strictly, to just this kid, not their whole family — for
 * workouts/workout_logs/one_rep_maxes, which carry an athlete_id per row.
 * See supabase/migrations/20260923170000_train_pro_v1.sql for the real RLS.
 */
export function athleteEntity(table, athleteId) {
  return {
    async list(sort = '-created_at', limit = 100) {
      if (!athleteId) return [];
      const { data, error } = await applySort(supabase.from(table).select('*').eq('athlete_id', athleteId), sort).limit(limit);
      if (error) throw error;
      return data || [];
    },
    async filter(where = {}, sort = '-created_at', limit = 100) {
      if (!athleteId) return [];
      let q = supabase.from(table).select('*').eq('athlete_id', athleteId);
      for (const [k, v] of Object.entries(where)) q = Array.isArray(v) ? q.in(k, v) : q.eq(k, v);
      const { data, error } = await applySort(q, sort).limit(limit);
      if (error) throw error;
      return data || [];
    },
    async get(id) {
      const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return data;
    },
  };
}

/**
 * Nutrition logs and macro goals aren't attributed to a specific athlete in
 * this schema (athlete_id is always null on them — see Nutrition.jsx) — they
 * belong to the parent's account (owner_id). There's no way to scope them
 * tighter than "this athlete's parent" without a schema change, so that's
 * the closest read-only approximation of "what this kid's login would see."
 */
export function ownerEntity(table, parentId) {
  return {
    async list(sort = '-created_at', limit = 100) {
      if (!parentId) return [];
      const { data, error } = await applySort(supabase.from(table).select('*').eq('owner_id', parentId), sort).limit(limit);
      if (error) throw error;
      return data || [];
    },
  };
}
