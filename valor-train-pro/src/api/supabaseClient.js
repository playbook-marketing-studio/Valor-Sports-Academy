import { createClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;
if (!url || !anon) {
  // eslint-disable-next-line no-console
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY (see .env.example)');
}

export const supabase = createClient(url || 'http://localhost', anon || 'anon', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
});

export const FUNCTIONS_URL = (import.meta.env.VITE_FUNCTIONS_URL || `${url}/functions/v1`).replace(/\/$/, '');

/** Call an edge function. Sends the user's JWT when signed in; anon key always. */
export async function callFn(name, { method = 'POST', body, query } = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const qs = query ? '?' + new URLSearchParams(query).toString() : '';
  const res = await fetch(`${FUNCTIONS_URL}/${name}${qs}`, {
    method,
    headers: {
      'content-type': 'application/json',
      apikey: anon,
      Authorization: `Bearer ${session?.access_token || anon}`,
    },
    body: method === 'GET' ? undefined : JSON.stringify(body || {}),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (!res.ok) {
    const err = new Error(data?.error || `${name} failed (${res.status})`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}
