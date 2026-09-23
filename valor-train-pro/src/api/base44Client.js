// Compatibility layer: the v1 screens were written against the Base44 SDK
// (base44.auth.*, base44.entities.X.list/filter/get/create/delete/bulkCreate).
// This keeps that call shape and backs it with Supabase, so the ported screens
// did not have to change. New code should import { supabase } directly.
import { supabase, callFn } from '@/api/supabaseClient';

const TABLES = {
  Workout: 'workouts',
  WorkoutLog: 'workout_logs',
  NutritionLog: 'nutrition_logs',
  MacroGoal: 'macro_goals',
  OneRepMax: 'one_rep_maxes',
  Athlete: 'athletes',
  Booking: 'bookings',
};
const SORT_ALIASES = { created_date: 'created_at', updated_date: 'updated_at' };

function applySort(q, sort) {
  if (!sort) return q;
  const desc = sort.startsWith('-');
  let col = desc ? sort.slice(1) : sort;
  col = SORT_ALIASES[col] || col;
  return q.order(col, { ascending: !desc });
}

const fail = (error) => { const e = new Error(error.message || 'Request failed'); e.status = error.code; throw e; };

function entity(table) {
  return {
    async list(sort = '-created_at', limit = 100) {
      const { data, error } = await applySort(supabase.from(table).select('*'), sort).limit(limit);
      if (error) fail(error);
      return data || [];
    },
    async filter(where = {}, sort = '-created_at', limit = 100) {
      let q = supabase.from(table).select('*');
      for (const [k, v] of Object.entries(where)) q = Array.isArray(v) ? q.in(k, v) : q.eq(k, v);
      const { data, error } = await applySort(q, sort).limit(limit);
      if (error) fail(error);
      return data || [];
    },
    async get(id) {
      const { data, error } = await supabase.from(table).select('*').eq('id', id).maybeSingle();
      if (error) fail(error);
      if (!data) { const e = new Error('Not found'); e.status = 404; throw e; }
      return data;
    },
    async create(values) {
      const { data, error } = await supabase.from(table).insert(values).select('*').single();
      if (error) fail(error);
      return data;
    },
    async bulkCreate(rows) {
      const { data, error } = await supabase.from(table).insert(rows).select('*');
      if (error) fail(error);
      return data || [];
    },
    async update(id, values) {
      const { data, error } = await supabase.from(table).update(values).eq('id', id).select('*').single();
      if (error) fail(error);
      return data;
    },
    async delete(id) {
      const { error } = await supabase.from(table).delete().eq('id', id);
      if (error) fail(error);
      return true;
    },
  };
}

export async function fetchProfile(userId) {
  const { data } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();
  return data;
}

const auth = {
  /** Returns { id, email, full_name, phone, role } for the signed-in user, or throws 401. */
  async me() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) { const e = new Error('Not signed in'); e.status = 401; throw e; }
    const profile = await fetchProfile(session.user.id);
    return {
      id: session.user.id,
      email: session.user.email,
      full_name: profile?.full_name || session.user.user_metadata?.full_name || '',
      phone: profile?.phone || '',
      role: profile?.role || 'parent',
      created_at: session.user.created_at,
    };
  },
  async loginViaEmailPassword(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    return data;
  },
  /** Creates the account and signs the user in (email confirmation is off for v1). */
  async register({ email, password, full_name, phone, role = 'parent' }) {
    const { data, error } = await supabase.auth.signUp({
      email, password, options: { data: { full_name, phone, role } },
    });
    if (error) throw new Error(error.message);
    if (!data.session) {
      const signin = await supabase.auth.signInWithPassword({ email, password });
      if (signin.error) throw new Error(signin.error.message);
      return signin.data;
    }
    return data;
  },
  async logout(redirectTo) {
    await supabase.auth.signOut();
    window.location.href = redirectTo && !redirectTo.includes('/login') ? '/login' : '/login';
  },
  redirectToLogin(returnTo) {
    const q = returnTo ? '?returnTo=' + encodeURIComponent(new URL(returnTo, window.location.origin).pathname) : '';
    window.location.href = '/login' + q;
  },
  async resetPasswordRequest(email) {
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
    if (error) throw new Error(error.message);
  },
  async resetPassword({ newPassword }) {
    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) throw new Error(error.message);
  },
  isAuthenticated: async () => !!(await supabase.auth.getSession()).data.session,
};

export const base44 = {
  auth,
  entities: Object.fromEntries(Object.entries(TABLES).map(([name, table]) => [name, entity(table)])),
  functions: {
    async invoke(name, body) {
      if (name === 'scanNutritionLabel') {
        const e = new Error('Label scanning is not available yet. Enter the macros by hand.');
        e.status = 501; throw e;
      }
      return callFn(name, { body });
    },
  },
  integrations: {
    Core: {
      async UploadFile() {
        const e = new Error('File upload is not available yet.');
        e.status = 501; throw e;
      },
    },
  },
  app: { async getPublicSettings() { return { id: 'valor-train-pro', public_settings: {} }; } },
};
