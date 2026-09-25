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
 * explicitly to one family instead of relying on RLS. An admin's own RLS
 * (is_admin()) sees every row in the gym, so "view as family" has to filter
 * by hand for exactly what the real owner_id/athlete_id RLS rule would
 * return a parent: rows they created (owner_id = them) OR rows tied to one
 * of their own athletes (athlete_id in their kids). See
 * supabase/migrations/20260923170000_train_pro_v1.sql for the real policy.
 */
export function familyEntity(table, family) {
  const ids = family?.athleteIds || [];
  const parentId = family?.parentId;

  const orClause = () => {
    const parts = [];
    if (parentId) parts.push(`owner_id.eq.${parentId}`);
    if (ids.length) parts.push(`athlete_id.in.(${ids.join(',')})`);
    return parts.join(',');
  };

  return {
    async list(sort = '-created_at', limit = 100) {
      const clause = orClause();
      if (!clause) return [];
      const { data, error } = await applySort(supabase.from(table).select('*').or(clause), sort).limit(limit);
      if (error) throw error;
      return data || [];
    },
    async filter(where = {}, sort = '-created_at', limit = 100) {
      const clause = orClause();
      if (!clause) return [];
      let q = supabase.from(table).select('*').or(clause);
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
