// Valor-specific constants and shared data helpers for the staff flow.
import { supabase } from '@/api/supabaseClient';

export const SITE_ASSESSMENT_URL = 'https://www.valorsportsacademywa.com/assessment#book';
export const VALOR_PHONE = '509-987-4612';

// Tests recorded at the assessment. Override with settings key "assessment_metrics" once Corey confirms the list.
export const DEFAULT_METRICS = [
  { key: 'sprint_10yd', label: '10-yard sprint', unit: 's' },
  { key: 'sprint_40yd', label: '40-yard dash', unit: 's' },
  { key: 'pro_agility', label: 'Pro agility (5-10-5)', unit: 's' },
  { key: 'vertical_in', label: 'Vertical jump', unit: 'in' },
  { key: 'broad_jump_in', label: 'Broad jump', unit: 'in' },
];

export async function loadSettings() {
  const { data } = await supabase.from('settings').select('key, value').in('key', ['enrollment', 'assessment_metrics']);
  const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  const e = map.enrollment || {};
  return {
    // One-time classes and class packs (Omar 9/23: no subscriptions). Content is included while one is active.
    enrollment: { placeholder: !!e.placeholder, note: e.note || '', items: Array.isArray(e.items) ? e.items : [] },
    metrics: Array.isArray(map.assessment_metrics) ? map.assessment_metrics : DEFAULT_METRICS,
  };
}

const usd = (c) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
const classesText = (n) => (n == null ? 'unlimited classes' : `${n} class${n === 1 ? '' : 'es'}`);
/** "$199 · 8 classes" (+ " · expires after 60 days"). */
export const priceLabel = (item) => (!item ? '' : `${usd(item.amount_cents)} · ${classesText(item.classes)}${item.expires_days ? ` · expires after ${item.expires_days} days` : ''}`);
/** The class/pack offered by default: the coach's recommendation, else the only item, else null (let them pick). */
export const defaultItem = (cfg, recommendedKey) => cfg?.items?.find((x) => x.key === recommendedKey) || (cfg?.items?.length === 1 ? cfg.items[0] : null);
export const itemName = (cfg, key) => cfg?.items?.find((x) => x.key === key)?.name || '';

/** A payment that currently unlocks content: paid, classes left, not expired. Mirrors athlete_enrolled() in the DB. */
export const countsAsEnrollment = (p) => p.status === 'paid'
  && (!p.covers_until || new Date(p.covers_until) > new Date())
  && (p.classes_total == null || p.classes_used < p.classes_total);
export const classesLeft = (p) => (p.classes_total == null ? null : p.classes_total - p.classes_used);

/**
 * Athlete ids that are enrolled right now: an active paid class/pack OR on a
 * program (a coach put them in a class). Asks the DB's athlete_enrolled() so the
 * app, the lock and the Athletes label can never disagree.
 */
export async function enrolledIds(athleteIds) {
  if (!athleteIds?.length) return new Set();
  const res = await Promise.all(athleteIds.map((aid) => supabase.rpc('athlete_enrolled', { aid }).then(({ data }) => (data ? aid : null))));
  return new Set(res.filter(Boolean));
}

export const athleteName = (a) => [a?.first_name, a?.last_name].filter(Boolean).join(' ');
/** "OMAR" -> "Omar" for greetings. Leaves already mixed-case names (e.g. "McKenzie") alone. */
export const displayFirstName = (name) => {
  const n = (name || '').trim();
  return n && n === n.toUpperCase() && n !== n.toLowerCase() ? n[0].toUpperCase() + n.slice(1).toLowerCase() : n;
};
export const telHref = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;
export const smsHref = (phone, body) => `sms:${String(phone || '').replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(body)}`;

/** Monday-Sunday calendar week containing `d` (default today), as 'YYYY-MM-DD' strings. */
export function weekRange(d = new Date()) {
  const start = new Date(d);
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7)); // back to Monday
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  const fmt = (x) => x.toISOString().slice(0, 10);
  const days = Array.from({ length: 7 }, (_, i) => { const x = new Date(start); x.setDate(start.getDate() + i); return fmt(x); });
  return { start: fmt(start), end: fmt(end), days };
}

/**
 * Compares a metric's latest value to the previous one for a trend chip.
 * unit 's' (a timed test) means lower is better; everything else, higher is better.
 */
export function metricDelta(latest, prev, unit) {
  const a = Number(prev);
  const b = Number(latest);
  if (prev == null || latest == null || Number.isNaN(a) || Number.isNaN(b)) return null;
  const diff = b - a;
  const lowerIsBetter = unit === 's';
  const direction = diff > 0 ? 'up' : diff < 0 ? 'down' : 'flat';
  const improved = diff === 0 ? null : lowerIsBetter ? diff < 0 : diff > 0;
  const digits = unit === 's' ? 2 : Number.isInteger(diff) ? 0 : 1;
  const sign = diff > 0 ? '+' : diff < 0 ? '-' : '';
  const label = `${sign}${Math.abs(diff).toFixed(digits)}${unit ? unit : ''}`;
  return { diff, direction, improved, label, tone: improved == null ? 'neutral' : improved ? 'good' : 'bad' };
}
