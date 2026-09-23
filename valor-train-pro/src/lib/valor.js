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
  const { data } = await supabase.from('settings').select('key, value').in('key', ['enrollment', 'classes', 'assessment_metrics']);
  const map = Object.fromEntries((data || []).map((r) => [r.key, r.value]));
  const e = map.enrollment || {};
  return {
    // Payment model is a switch (pending Omar/Corey): billing 'monthly' | 'one_time'. Content is included with enrollment.
    enrollment: { billing: e.billing === 'monthly' ? 'monthly' : 'one_time', placeholder: !!e.placeholder, programs: Array.isArray(e.programs) ? e.programs : [], drop_in: e.drop_in || null },
    classes: Array.isArray(map.classes) ? map.classes : [], // [{ key, name }] recommended at the assessment
    metrics: Array.isArray(map.assessment_metrics) ? map.assessment_metrics : DEFAULT_METRICS,
  };
}

const usd = (c) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
/** "$199/mo" or "$199 one time" for a program under the current billing; drop-in is always one time. */
export const priceLabel = (cfg, program) => (!program ? '' : program.key === 'drop_in' || cfg?.billing !== 'monthly' ? `${usd(program.amount_cents)} one time` : `${usd(program.amount_cents)}/mo`);
/** The program a family is offered: the coach's recommendation if it's a program, else the only one, else null (let them pick). */
export const defaultProgram = (cfg, recommendedKey) => cfg?.programs?.find((p) => p.key === recommendedKey) || (cfg?.programs?.length === 1 ? cfg.programs[0] : null);
/** Monthly cash / Venmo covers one month plus 3 days' grace (same as Stripe renewals). */
export const monthFromNow = () => { const d = new Date(); d.setMonth(d.getMonth() + 1); d.setDate(d.getDate() + 3); return d.toISOString(); };

/** A payment row that currently counts as enrollment: paid, not a drop-in, not lapsed. Mirrors athlete_enrolled() in the DB. */
export const countsAsEnrollment = (p) => p.status === 'paid' && p.plan_key !== 'drop_in' && (!p.covers_until || new Date(p.covers_until) > new Date());

/** Athlete ids that are enrolled right now. */
export async function enrolledIds(athleteIds) {
  if (!athleteIds?.length) return new Set();
  const { data } = await supabase.from('payments').select('athlete_id, status, plan_key, covers_until').in('athlete_id', athleteIds).eq('status', 'paid');
  return new Set((data || []).filter(countsAsEnrollment).map((r) => r.athlete_id));
}

export const athleteName = (a) => [a?.first_name, a?.last_name].filter(Boolean).join(' ');
export const telHref = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;
export const smsHref = (phone, body) => `sms:${String(phone || '').replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(body)}`;
