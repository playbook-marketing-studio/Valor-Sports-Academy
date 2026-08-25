/* ==========================================================================
   Netlify Forms  ->  Meta Conversions API (server-side events)
   --------------------------------------------------------------------------
   Netlify invokes this function automatically on every VERIFIED form
   submission (the filename "submission-created" is the trigger — do not
   rename it). It sends the matching conversion to Meta server-to-server, so
   the event survives ad blockers, iOS/ITP cookie limits and dropped browser
   pixels.

   Dedup: the browser pixel and this function send the SAME event_id (stamped
   into the hidden pb_event_id field by cta.js). Meta keeps one, not two.

   Config — Netlify > Site configuration > Environment variables:
     META_CAPI_DATASET_ID    required   dataset / pixel ID
     META_CAPI_TOKEN         required   Conversions API access token
     META_CAPI_DATASET_ID_2  optional   second dataset (account migration)
     META_CAPI_TOKEN_2       optional   token for the second dataset
     META_CAPI_TEST_CODE     optional   Events Manager > Test Events code
   Nothing fires until DATASET_ID + TOKEN are set; the function no-ops safely.
   ========================================================================== */

const crypto = require('node:crypto');

const GRAPH_VERSION = 'v21.0';

/* Which Meta standard event each form represents. Forms not listed here are
   ignored (the newsletter/bot-field style posts should never book a lead). */
const EVENT_BY_FORM = {
  contact: 'Lead',
  assessment: 'Lead',
  giveaway: 'CompleteRegistration'
};

/* Per-form field mapping — Netlify hands us the raw input names. */
const FIELDS_BY_FORM = {
  contact:    { email: 'email', phone: 'phone',        first: 'first',       last: 'last' },
  assessment: { email: 'email', phone: 'parent-phone', full:  'parent-name'  },
  giveaway:   { email: 'email', phone: 'phone',        full:  'name'         }
};

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

/* ---- Meta normalisation rules (must match, or the hash will not match) ---- */

function normEmail(v) {
  const s = String(v || '').trim().toLowerCase();
  return s.includes('@') ? s : '';
}

/* Digits only, with country code, no "+". US numbers get a leading 1. */
function normPhone(v) {
  let s = String(v || '').replace(/\D/g, '');
  if (s.length === 10) s = '1' + s;
  if (s.length === 11 && s[0] === '1') return s;
  return s.length >= 8 ? s : '';
}

/* Lowercase, letters only (Meta strips punctuation, spaces and accents). */
function normName(v) {
  return String(v || '')
    .trim()
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z]/g, '');
}

/* First token is the given name, everything after it is the surname — so
   "Michael Van Dyke" hashes as vandyke, not dyke, which is what Meta holds. */
function splitFullName(v) {
  const parts = String(v || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return { first: '', last: '' };
  return { first: parts[0], last: parts.slice(1).join(' ') };
}

/* Build Meta's user_data block. Every value is hashed except fbc/fbp/ip/ua,
   which Meta requires in the clear. */
function buildUserData(form, d) {
  const map = FIELDS_BY_FORM[form] || {};
  const ud = {};

  const em = normEmail(d[map.email]);
  if (em) ud.em = [sha256(em)];

  const ph = normPhone(d[map.phone]);
  if (ph) ud.ph = [sha256(ph)];

  let first = map.first ? d[map.first] : '';
  let last = map.last ? d[map.last] : '';
  if (map.full) ({ first, last } = splitFullName(d[map.full]));

  const fn = normName(first);
  if (fn) ud.fn = [sha256(fn)];
  const ln = normName(last);
  if (ln) ud.ln = [sha256(ln)];

  /* City / state, when the form collects it ("Richland, WA"). */
  if (d['city-state']) {
    const [city, state] = String(d['city-state']).split(',');
    const ct = normName(city);
    if (ct) ud.ct = [sha256(ct)];
    const st = normName(state);
    if (st) ud.st = [sha256(st)];
  }

  /* Click/browser identifiers — by far the strongest match signals. */
  if (d.pb_fbc) ud.fbc = String(d.pb_fbc);
  if (d.pb_fbp) ud.fbp = String(d.pb_fbp);

  /* Netlify appends ip / user_agent to every submission's data object. */
  const ip = d.ip || d.pb_ip;
  const ua = d.user_agent || d.pb_ua;
  if (ip) ud.client_ip_address = String(ip);
  if (ua) ud.client_user_agent = String(ua);

  return ud;
}

/* Post one payload to one dataset. Never throws — a Meta outage must not
   turn into a failed form submission for the visitor. */
async function send(datasetId, token, body, label) {
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${datasetId}/events`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, access_token: token })
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      console.error(`[capi] ${label} ${datasetId} HTTP ${res.status}`, JSON.stringify(json));
      return false;
    }
    console.log(`[capi] ${label} -> ${datasetId} received=${json.events_received ?? '?'}`);
    return true;
  } catch (err) {
    console.error(`[capi] ${label} ${datasetId} threw`, err && err.message);
    return false;
  }
}

exports.handler = async (event) => {
  /* Always 200. Netlify retries non-2xx, and a retry would double-count. */
  const ok = (msg) => {
    if (msg) console.log('[capi]', msg);
    return { statusCode: 200, body: msg || 'ok' };
  };

  let payload;
  try {
    payload = (JSON.parse(event.body || '{}') || {}).payload || {};
  } catch (_) {
    return ok('unparseable body');
  }

  const d = payload.data || {};
  const form = payload.form_name || d['form-name'] || '';
  const eventName = EVENT_BY_FORM[form];
  if (!eventName) return ok(`ignoring form "${form}"`);

  /* Honeypot — Netlify usually filters these, belt and braces. */
  if (d['bot-field']) return ok('honeypot tripped, not sending');

  const datasets = [
    { id: process.env.META_CAPI_DATASET_ID, token: process.env.META_CAPI_TOKEN },
    { id: process.env.META_CAPI_DATASET_ID_2, token: process.env.META_CAPI_TOKEN_2 }
  ].filter((x) => x.id && x.token);

  if (!datasets.length) return ok('META_CAPI_DATASET_ID / META_CAPI_TOKEN not set — skipping');

  const userData = buildUserData(form, d);
  if (!userData.em && !userData.ph && !userData.fbc) {
    return ok(`no usable identifiers on "${form}" submission — skipping`);
  }

  /* Same id the browser pixel used, so Meta dedupes. Fall back to the
     Netlify submission id, which is unique per submission. */
  const eventId = d.pb_event_id || `netlify.${payload.id || Date.now()}`;

  const body = {
    data: [
      {
        event_name: eventName,
        event_time: Math.floor(
          (payload.created_at ? new Date(payload.created_at).getTime() : Date.now()) / 1000
        ),
        event_id: eventId,
        event_source_url: d.pb_source_url || payload.site_url || undefined,
        action_source: 'website',
        user_data: userData,
        custom_data: {
          form_name: form,
          content_name: form === 'giveaway' ? 'Summer of Valor giveaway' : `Valor ${form} form`,
          ...(d.utm_source ? { utm_source: d.utm_source } : {}),
          ...(d.utm_campaign ? { utm_campaign: d.utm_campaign } : {})
        }
      }
    ]
  };

  if (process.env.META_CAPI_TEST_CODE) body.test_event_code = process.env.META_CAPI_TEST_CODE;

  await Promise.all(
    datasets.map((ds) => send(ds.id, ds.token, body, `${eventName}/${form}`))
  );

  return ok();
};
