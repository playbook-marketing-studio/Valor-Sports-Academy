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
  return {
    enrollment: map.enrollment || null, // { name, amount_cents, placeholder } — the ONE thing Stripe charges; content is included
    classes: Array.isArray(map.classes) ? map.classes : [], // [{ key, name }] recommended at the assessment
    metrics: Array.isArray(map.assessment_metrics) ? map.assessment_metrics : DEFAULT_METRICS,
  };
}

/** Athlete ids with a paid enrollment (paid online or marked paid by staff). */
export async function enrolledIds(athleteIds) {
  if (!athleteIds?.length) return new Set();
  const { data } = await supabase.from('payments').select('athlete_id').in('athlete_id', athleteIds).eq('status', 'paid');
  return new Set((data || []).map((r) => r.athlete_id));
}
export const athleteName = (a) => [a?.first_name, a?.last_name].filter(Boolean).join(' ');
export const telHref = (phone) => `tel:${String(phone || '').replace(/[^\d+]/g, '')}`;
export const smsHref = (phone, body) => `sms:${String(phone || '').replace(/[^\d+]/g, '')}?&body=${encodeURIComponent(body)}`;
