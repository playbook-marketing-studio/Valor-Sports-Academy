// ════════════════════════════════════════════════════════════════════════
// Edge Function · waiver  (Valor Train Pro, 11/18/2026) — the digital waiver.
// One signed record per athlete per waiver version (settings.waiver.version; null = not switched on yet).
// A parent/guardian signs for a minor, an adult athlete signs for themself. Proof kept: exact text hash, typed name,
// role, checkbox, time, login/email, IP, user agent. The signer gets a copy by email (Valor Gmail).
//
// No login needed (private per-athlete link, emailed or shown as a QR at the front desk):
//   {action:"link", t}                          → athlete first/last name, waiver text, signed or not
//   {action:"sign", t, signer_name, signer_role, signer_email, agree:true, version}
// Family login:
//   {action:"mine"}                             → waiver text + setting + this login's athletes and their status
//   {action:"sign", athlete_id, signer_name, signer_role, agree:true, version}
//   {action:"copy", signature_id}               → a signed copy (theirs) with its text
// Staff:
//   {action:"list"}                             → every active athlete: signed or not, when, by whom, last email sent
//   {action:"send", athlete_id}                 → emails the parent the sign link (10 min throttle per athlete)
//   {action:"sign_link", athlete_id}            → the private link (for the front-desk QR)
//   {action:"copy", signature_id}
//   {action:"setting", required}                → 'prompt' (default) | 'block' | 'off'
//   {action:"team_add", name} / {action:"team_set", team_id, active}   → team sign links (below)
// Team sign links (Omar 11/19/2026), for outside teams whose kids aren't in the app (Maniacs, Jr Bombers):
//   {action:"team_link", tt}                    → team name + waiver text (no login)
//   {action:"team_sign", tt, athlete_name, signer_name, signer_role, signer_email, agree:true, version}
//   Nothing verifies who signed (anyone with the link can fill it out): stored as method 'team', no athlete_id,
//   shown to staff as not verified. Limits: 15 signatures per IP per team per hour, 300 per team per day,
//   staff can turn a team's link off. Same text hash, typed names, role, checkbox, time, IP, device, emailed copy.
// STAFF-ONLY LOCK (Omar 11/19/2026: "staff only, make it clear it's still not working"): while the waiver text for
// settings.waiver.version is not status 'live' (the 10/27 text is a draft until Michael confirms two spots), families
// get no waiver at all (no sign screen, Home card or Account row; links and team links say "not ready yet"), and
// every sign / email action is refused with 423. Staff still see the Waivers page, make team links, preview the text.
// Publishing the confirmed text as status 'live' opens it, nothing else to change.
// TEST ATHLETES (11/24/2026, so Michael and Corey can click through the real email -> sign -> done before go-live):
// an athlete marked is_example gets the private link, the sign and the staff "send" email even while the text is a
// draft. Real athletes stay locked. Delete the test athletes and their signatures after the test.
// Deploy: supabase functions deploy waiver --no-verify-jwt --project-ref gpotwyuttkkygvxzktep --use-api
// ════════════════════════════════════════════════════════════════════════
import { admin, appOrigin, bad, cors, json, userFromRequest } from "../_shared/common.ts";
import { btn, esc, mailConfigured, sendMail, VALOR, wrapHtml } from "../_shared/mail.ts";

const enc = new TextEncoder();
const LINK_DAYS = 60;
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function hmac(payload: string) {
  const secret = Deno.env.get("WAIVER_LINK_SECRET") || Deno.env.get("FAMILY_CLAIM_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const key = await crypto.subtle.importKey("raw", enc.encode(`waiver:${secret}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload)))).slice(0, 32);
}
/** athlete id + expiry (days since epoch), signed. Short enough for a QR code. */
async function makeToken(athleteId: string) {
  const exp = Math.floor(Date.now() / 86400000) + LINK_DAYS;
  const body = `${athleteId.replace(/-/g, "")}.${exp.toString(36)}`;
  return `${body}.${await hmac(body)}`;
}
async function readToken(t: string) {
  const [hex, exp36, sig] = String(t || "").split(".");
  if (!hex || !exp36 || !sig || !/^[0-9a-f]{32}$/.test(hex)) return null;
  if (sig !== await hmac(`${hex}.${exp36}`)) return null;
  if (parseInt(exp36, 36) < Math.floor(Date.now() / 86400000)) return { expired: true as const };
  return { athleteId: `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}` };
}
const signUrl = async (origin: string, athleteId: string) => `${origin}/waiver/${await makeToken(athleteId)}`;

// Omar 11/19: never lock families out. 'prompt' = the sign screen each time they open the app, with "Not now".
// 'block' = no "Not now" (kept, off by default). 'off' = nothing in the app. Athletes added in the app on or after
// signup_required_from (a new sign-up) always have to sign, whatever this says.
type Setting = { version: string | null; required: "prompt" | "block" | "off"; signup_required_from: string | null };
const LEGACY: Record<string, Setting["required"]> = { screen: "prompt", banner: "prompt" };
async function setting(): Promise<Setting> {
  const { data } = await admin.from("settings").select("value").eq("key", "waiver").maybeSingle();
  const v = (data?.value || {}) as Partial<Setting>;
  const r = String(v.required || "");
  const required = (["prompt", "block", "off"].includes(r) ? r : LEGACY[r] || "prompt") as Setting["required"];
  return { version: v.version || null, required, signup_required_from: v.signup_required_from || null };
}
async function waiverText(version: string | null) {
  if (!version) return null;
  const { data } = await admin.from("waiver_texts").select("version, title, body, body_sha256, status, review_note").eq("version", version).maybeSingle();
  return data;
}
const fullName = (a: { first_name?: string; last_name?: string | null }) => [a.first_name, a.last_name].filter(Boolean).join(" ");
const clean = (v: unknown, max = 80) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
const fmtWhen = (iso: string) => new Intl.DateTimeFormat("en-US", { timeZone: "America/Los_Angeles", dateStyle: "long", timeStyle: "short" }).format(new Date(iso)) + " Pacific";
const ROLE = { parent: "Parent", guardian: "Legal guardian", athlete: "Athlete (18 or older)" } as Record<string, string>;

/** The newest signature for this athlete on this version, or null. */
async function latestSig(athleteId: string, version: string) {
  const { data } = await admin.from("waiver_signatures").select("id, signer_name, signer_role, signed_at, method")
    .eq("athlete_id", athleteId).eq("version", version).order("signed_at", { ascending: false }).limit(1);
  return data?.[0] || null;
}

// ── the waiver as email HTML (headings, paragraphs; review marks shown as plain words) ──
function waiverHtml(body: string) {
  return body.split(/\n{2,}/).map((p, i) => {
    const t = esc(p.replace(/\[\[|\]\]/g, "").trim());
    if (i === 0) return `<p style="font-weight:800;margin:6px 0 10px">${t}</p>`;
    if (p.startsWith("### ")) return `<p style="font-weight:700;margin:14px 0 4px">${t.slice(4)}</p>`;
    if (p.startsWith("## ")) return `<p style="font-weight:800;margin:18px 0 6px">${t.slice(3)}</p>`;
    return `<p style="margin:0 0 10px">${t}</p>`;
  }).join("");
}

async function emailCopy(sig: Record<string, any>, text: { title: string; body: string }) {
  if (!sig.signer_email || sig.signer_email.endsWith(".test") || !mailConfigured()) return false;  // *.test = test logins, never mailed
  const subject = `Your signed Valor waiver for ${sig.athlete_name}`;
  const block = `<div style="border:1px solid #d8d2c4;background:#fff;border-radius:12px;padding:14px 16px;margin:14px 0">
    <p style="margin:0 0 4px"><b>Athlete:</b> ${esc(sig.athlete_name)}</p>
    <p style="margin:0 0 4px"><b>Signed by:</b> ${esc(sig.signer_name)} (${esc(ROLE[sig.signer_role] || sig.signer_role)})</p>
    <p style="margin:0 0 4px"><b>Signed:</b> ${esc(fmtWhen(sig.signed_at))}</p>
    <p style="margin:0;font-size:13px;color:#6b665c">Waiver version ${esc(sig.version)} · record ${esc(String(sig.id).slice(0, 8))}</p></div>`;
  await sendMail({
    to: sig.signer_email, subject,
    text: `Thanks for signing. This is your copy of the Valor waiver for ${sig.athlete_name}, signed by ${sig.signer_name} on ${fmtWhen(sig.signed_at)}. Questions? Text us at ${VALOR.phone}.`,
    html: wrapHtml(subject, `<p>Thanks for signing. Here's your copy to keep.</p>${block}
      <div style="font-size:13px;line-height:1.5;color:#2b2822;border-top:1px solid #d8d2c4;padding-top:10px">
        ${waiverHtml(text.body)}</div>${block}`),
  });
  await admin.from("waiver_signatures").update({ emailed_at: new Date().toISOString() }).eq("id", sig.id);
  return true;
}

async function record(req: Request, a: Record<string, any>, body: Record<string, unknown>, s: Setting, via: { method: "app" | "link"; user?: { id: string; email?: string } }) {
  if (!s.version) return bad("The waiver isn't switched on yet.", 409);
  const text = await waiverText(s.version);
  if (!text) return bad("waiver text missing", 500);
  if (String(body.version || "") !== s.version) return bad("The waiver was just updated. Reload the page and read the new version.", 409);
  if (body.agree !== true) return bad("Check the box to agree.");
  const signer_name = clean(body.signer_name);
  if (signer_name.length < 3 || !/\s/.test(signer_name)) return bad("Type your full first and last name.");
  const role = String(body.signer_role || "");
  if (!["parent", "guardian", "athlete"].includes(role)) return bad("Pick who's signing.");
  if (role === "athlete" && a.age && a.age < 18) return bad(`A parent or guardian signs for athletes under 18.`);
  const signer_email = (via.user?.email || clean(body.signer_email, 120)).toLowerCase();
  if (via.method === "link" && !emailOk(signer_email)) return bad("Add your email so we can send you a copy.");
  const existing = await latestSig(a.id, s.version);
  if (existing) return json({ already: true, signature: existing });
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
  const { data: sig, error } = await admin.from("waiver_signatures").insert({
    athlete_id: a.id, version: text.version, body_sha256: text.body_sha256, athlete_name: fullName(a),
    signer_name, signer_role: role, signer_email: signer_email || null, signer_user_id: via.user?.id || null,
    method: via.method, agreed: true, ip, user_agent: (req.headers.get("user-agent") || "").slice(0, 400) || null,
  }).select("*").single();
  if (error) return bad(error.message, 500);
  let emailed = false;
  try { emailed = await emailCopy(sig, text); } catch (e) { console.error("waiver copy email", e); }
  return json({ signed: true, emailed, signature: { id: sig.id, signer_name, signer_role: role, signed_at: sig.signed_at, method: via.method } });
}

// ── team sign links ──
const teamUrl = (origin: string, token: string) => `${origin}/waiver/team/${token}`;
async function teamByToken(tt: string) {
  if (!/^[A-Za-z0-9_-]{16,40}$/.test(tt)) return null;
  const { data } = await admin.from("waiver_teams").select("id, name, active").eq("token", tt).maybeSingle();
  return data;
}
async function recordTeam(req: Request, team: { id: string; name: string }, body: Record<string, unknown>, s: Setting) {
  if (!s.version) return bad("The waiver isn't switched on yet.", 409);
  const text = await waiverText(s.version);
  if (!text) return bad("waiver text missing", 500);
  if (String(body.version || "") !== s.version) return bad("The waiver was just updated. Reload the page and read the new version.", 409);
  if (body.agree !== true) return bad("Check the box to agree.");
  const signer_name = clean(body.signer_name);
  if (signer_name.length < 3 || !/\s/.test(signer_name)) return bad("Type your full first and last name.");
  const role = String(body.signer_role || "");
  if (!["parent", "guardian", "athlete"].includes(role)) return bad("Pick who's signing.");
  const athlete_name = role === "athlete" ? signer_name : clean(body.athlete_name);
  if (athlete_name.length < 3 || !/\s/.test(athlete_name)) return bad("Type the athlete's first and last name.");
  const signer_email = clean(body.signer_email, 120).toLowerCase();
  if (!emailOk(signer_email)) return bad("Add your email so we can send you a copy.");
  const ip = (req.headers.get("cf-connecting-ip") || req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || null;
  const hourAgo = new Date(Date.now() - 3600000).toISOString(), dayAgo = new Date(Date.now() - 86400000).toISOString();
  const [{ count: fromIp }, { count: today }] = await Promise.all([
    ip ? admin.from("waiver_signatures").select("id", { count: "exact", head: true }).eq("team_id", team.id).eq("ip", ip).gte("signed_at", hourAgo) : Promise.resolve({ count: 0 }),
    admin.from("waiver_signatures").select("id", { count: "exact", head: true }).eq("team_id", team.id).gte("signed_at", dayAgo),
  ]);
  if ((fromIp || 0) >= 15 || (today || 0) >= 300) return bad(`Too many waivers from here for now. Try again later, or text us at ${VALOR.phone}.`, 429);
  // the same kid, signed by the same email, on this version: already on file
  const { data: dupe } = await admin.from("waiver_signatures").select("id, athlete_name, signer_name, signer_role, signed_at, method")
    .eq("team_id", team.id).eq("version", s.version).ilike("athlete_name", athlete_name).ilike("signer_email", signer_email).limit(1);
  if (dupe?.length) return json({ already: true, signature: dupe[0] });
  const { data: sig, error } = await admin.from("waiver_signatures").insert({
    athlete_id: null, team_id: team.id, version: text.version, body_sha256: text.body_sha256, athlete_name,
    signer_name, signer_role: role, signer_email, signer_user_id: null,
    method: "team", agreed: true, ip, user_agent: (req.headers.get("user-agent") || "").slice(0, 400) || null,
  }).select("*").single();
  if (error) return bad(error.message, 500);
  let emailed = false;
  try { emailed = await emailCopy(sig, text); } catch (e) { console.error("waiver copy email", e); }
  return json({ signed: true, emailed, signature: { id: sig.id, athlete_name, signer_name, signer_role: role, signed_at: sig.signed_at, method: "team" } });
}
async function teamsForStaff(req: Request, s: Setting) {
  const { data: teams } = await admin.from("waiver_teams").select("id, name, token, active, created_at, turned_off_at").order("created_at");
  const { data: sigs } = (teams || []).length && s.version
    ? await admin.from("waiver_signatures").select("id, team_id, athlete_name, signer_name, signer_role, signer_email, signed_at, method").not("team_id", "is", null).eq("version", s.version).order("signed_at", { ascending: false })
    : { data: [] };
  const origin = appOrigin(req);
  const count: Record<string, number> = {}; (sigs || []).forEach((x) => { count[x.team_id] = (count[x.team_id] || 0) + 1; });
  const name: Record<string, string> = {}; (teams || []).forEach((t) => { name[t.id] = t.name; });
  return {
    teams: (teams || []).map((t) => ({ id: t.id, name: t.name, active: t.active, url: teamUrl(origin, t.token), signed: count[t.id] || 0, created_at: t.created_at })),
    team_signatures: (sigs || []).map((x) => ({ ...x, team: name[x.team_id] || "" })),
  };
}

// ── staff ──
async function staffList(s: Setting) {
  const { data: kids } = await admin.from("athletes")
    .select("id, first_name, last_name, age, parent_name, parent_email, parent_id, user_id, is_example, archived_at")
    .is("archived_at", null).order("first_name");
  const ids = (kids || []).map((k) => k.id);
  const [{ data: sigs }, { data: reqs }] = await Promise.all([
    ids.length && s.version ? admin.from("waiver_signatures").select("id, athlete_id, signer_name, signer_role, signed_at, method").eq("version", s.version).in("athlete_id", ids).order("signed_at", { ascending: false }) : { data: [] },
    ids.length ? admin.from("waiver_requests").select("athlete_id, sent_at, kind").in("athlete_id", ids).order("sent_at", { ascending: false }) : { data: [] },
  ]);
  const sigBy: Record<string, any> = {}; (sigs || []).forEach((x) => { if (!sigBy[x.athlete_id]) sigBy[x.athlete_id] = x; });
  const reqBy: Record<string, any> = {}; const reqCount: Record<string, number> = {};
  (reqs || []).forEach((x) => { if (!reqBy[x.athlete_id]) reqBy[x.athlete_id] = x; reqCount[x.athlete_id] = (reqCount[x.athlete_id] || 0) + 1; });
  // login emails for kids whose family has a login but no parent_email on file
  const owners = [...new Set((kids || []).filter((k) => !k.parent_email && k.parent_id).map((k) => k.parent_id))];
  const { data: profs } = owners.length ? await admin.from("profiles").select("id, email").in("id", owners) : { data: [] };
  const loginEmail: Record<string, string> = {}; (profs || []).forEach((p) => { loginEmail[p.id] = p.email; });
  return (kids || []).map((k) => ({
    id: k.id, name: fullName(k), age: k.age, is_example: k.is_example, parent_name: k.parent_name,
    email: k.parent_email || loginEmail[k.parent_id] || null, has_login: !!(k.parent_id || k.user_id),
    signature: sigBy[k.id] || null, last_sent: reqBy[k.id] || null, sent_count: reqCount[k.id] || 0,
  }));
}

/** Who gets the "please sign" email for this kid: the parent email on file, else the family login's email. */
async function contactFor(a: Record<string, any>) {
  if (a.parent_email) return String(a.parent_email).trim().toLowerCase();
  if (!a.parent_id) return null;
  const { data } = await admin.from("profiles").select("email, role").eq("id", a.parent_id).maybeSingle();
  return data && data.role !== "admin" ? String(data.email).toLowerCase() : null;
}

function pleaseSignEmail(first: string, parentFirst: string, link: string, reminder = false) {
  const subject = reminder ? `Reminder: ${first}'s Valor waiver still needs a signature` : `Please sign ${first}'s Valor waiver`;
  const hi = parentFirst ? `Hi ${esc(parentFirst)},` : "Hi there,";
  const lead = reminder
    ? `<p>Quick reminder, we still need a signed waiver for ${esc(first)}. It only takes a couple minutes.</p>`
    : `<p>We moved our waiver into the Valor app. Every athlete needs a signed one on file with us, and it only takes a couple minutes.</p>`;
  const html = wrapHtml(subject, `<p>${hi}</p>${lead}${btn(link, `Sign ${first}'s waiver`)}
    <p>The link is just for ${esc(first)}. If you have more than one athlete at Valor, each one gets their own link.</p>
    <p style="font-size:13px;color:#6b665c">Button not working? Copy this link into your browser:<br><span style="word-break:break-all">${esc(link)}</span></p>`,
    `Questions? Text us at ${VALOR.phone}.`);
  const text = `${parentFirst ? `Hi ${parentFirst},` : "Hi there,"} ${reminder ? `Quick reminder, we still need a signed waiver for ${first}.` : "We moved our waiver into the Valor app. Every athlete needs a signed one on file with us."} Sign here: ${link} Questions? Text us at ${VALOR.phone}.`;
  return { subject, html, text };
}

async function staffSend(req: Request, staffId: string, athleteId: string, open: boolean) {
  const { data: a } = await admin.from("athletes").select("*").eq("id", athleteId).maybeSingle();
  if (!a || a.archived_at) return bad("athlete not found", 404);
  if (!open && !a.is_example) return bad("Emails to families are off until the waiver is finished.", 423);
  const to = await contactFor(a);
  if (!to) return bad("No parent email on file. Add one on the athlete page, or show them the QR code at the desk.", 409);
  if (!mailConfigured()) return bad("Email isn't connected right now.", 503);
  const { error: dup } = await admin.from("message_alerts").insert({ key: `waiver-send:${athleteId}:${Math.floor(Date.now() / 600000)}` });
  if (dup?.code === "23505") return bad("Already sent in the last 10 minutes.", 429);
  const link = await signUrl(appOrigin(req), athleteId);
  const parentFirst = clean(a.parent_name, 80).split(" ")[0] || "";
  const m = pleaseSignEmail(a.first_name, parentFirst, link);
  await sendMail({ to, subject: m.subject, text: m.text, html: m.html });
  await admin.from("waiver_requests").insert({ athlete_id: athleteId, email: to, kind: "resend", sent_by: staffId });
  return json({ sent: true, to });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return bad("POST only", 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad("invalid json"); }
  try {
    const s = await setting();
    const open = !!s.version && (await waiverText(s.version))?.status === "live";
    const NOT_OPEN = "The waiver isn't open for signing yet. Valor is still finishing it.";

    // ── team link: no login ──
    if (body.tt !== undefined && (body.action === "team_link" || body.action === "team_sign")) {
      const team = await teamByToken(String(body.tt));
      if (!team) return bad("That link isn't right. Ask the coach for the team's link.", 404);
      if (!team.active) return bad(`That team link was turned off. Text us at ${VALOR.phone}.`, 410);
      if (!open) return body.action === "team_sign" ? bad(NOT_OPEN, 423) : json({ team: { name: team.name }, waiver: null, not_open: true });
      if (body.action === "team_sign") return await recordTeam(req, team, body, s);
      return json({ team: { name: team.name }, waiver: await waiverText(s.version) });
    }

    // ── private link: no login ──
    if (body.t !== undefined && (body.action === "link" || body.action === "sign")) {
      const tok = await readToken(String(body.t));
      if (!tok) return bad("That link isn't right. Ask us for a new one.", 404);
      if ("expired" in tok) return bad(`That link expired. Text us at ${VALOR.phone} and we'll send a new one.`, 410);
      const { data: a } = await admin.from("athletes").select("id, first_name, last_name, age, archived_at, is_example").eq("id", tok.athleteId).maybeSingle();
      if (!a || a.archived_at) return bad("That link isn't active anymore. Text us and we'll sort it out.", 404);
      if (!open && !a.is_example) return body.action === "sign" ? bad(NOT_OPEN, 423) : json({ athlete: { first_name: a.first_name, last_name: a.last_name, age: a.age }, signed: null, waiver: null, not_open: true });
      if (body.action === "sign") return await record(req, a, body, s, { method: "link" });
      const sig = s.version ? await latestSig(a.id, s.version) : null;
      return json({ athlete: { first_name: a.first_name, last_name: a.last_name, age: a.age }, signed: sig ? { signer_name: sig.signer_name, signed_at: sig.signed_at } : null, waiver: await waiverText(s.version) });
    }

    const user = await userFromRequest(req);
    if (!user) return bad("sign in first", 401);
    const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    const isStaff = prof?.role === "admin";

    if (body.action === "copy") {
      const { data: sig } = await admin.from("waiver_signatures").select("*").eq("id", String(body.signature_id || "")).maybeSingle();
      if (!sig) return bad("not found", 404);
      if (!isStaff) {
        const { data: a } = sig.athlete_id ? await admin.from("athletes").select("parent_id, user_id").eq("id", sig.athlete_id).maybeSingle() : { data: null };
        if (!a || (a.parent_id !== user.id && a.user_id !== user.id)) return bad("not yours", 403);
      }
      const { data: text } = await admin.from("waiver_texts").select("version, title, body, status, review_note").eq("version", sig.version).maybeSingle();
      const out = isStaff ? sig : { ...sig, ip: undefined, user_agent: undefined };
      return json({ signature: out, waiver: text });
    }

    if (isStaff) {
      if (body.action === "list") return json({ setting: s, open, waiver: s.version ? { version: s.version, status: (await waiverText(s.version))?.status } : null, athletes: await staffList(s), ...(await teamsForStaff(req, s)) });
      if (body.action === "team_add") {
        const name = clean(body.name, 60);
        if (name.length < 2) return bad("Type the team's name.");
        const token = b64url(crypto.getRandomValues(new Uint8Array(16)));
        const { data, error } = await admin.from("waiver_teams").insert({ name, token, created_by: user.id }).select("id").single();
        if (error) return bad(error.message, 500);
        return json({ id: data.id, url: teamUrl(appOrigin(req), token) });
      }
      if (body.action === "team_set") {
        const active = body.active === true;
        const { data, error } = await admin.from("waiver_teams").update({ active, turned_off_at: active ? null : new Date().toISOString() }).eq("id", String(body.team_id || "")).select("id");
        if (error) return bad(error.message, 500);
        if (!data?.length) return bad("team not found", 404);
        return json({ active });
      }
      if (body.action === "send") return await staffSend(req, user.id, String(body.athlete_id || ""), open);
      if (body.action === "sign_link") return json({ url: await signUrl(appOrigin(req), String(body.athlete_id || "")) });
      if (body.action === "setting") {
        const required = String(body.required || "");
        if (!["prompt", "block", "off"].includes(required)) return bad("required must be prompt, block or off");
        const { error } = await admin.from("settings").update({ value: { ...s, required }, updated_at: new Date().toISOString() }).eq("key", "waiver");
        if (error) return bad(error.message, 500);
        return json({ setting: { ...s, required } });
      }
      return bad("staff: use list, send, sign_link, copy, setting, team_add or team_set", 404);
    }

    // ── family login ──
    if (!open) {
      if (body.action === "mine") return json({ setting: { ...s, required: "off" }, waiver: null, athletes: [], not_open: true });
      if (body.action === "sign") return bad(NOT_OPEN, 423);
    }
    if (body.action === "mine") {
      const { data: kids } = await admin.from("athletes").select("id, first_name, last_name, age, parent_id, user_id, app_signup_at")
        .or(`parent_id.eq.${user.id},user_id.eq.${user.id}`).is("archived_at", null).order("first_name");
      const out = [];
      for (const k of kids || []) {
        const sig = s.version ? await latestSig(k.id, s.version) : null;
        // a new sign-up (athlete added in the app once the waiver is on) signs before using the app, no "Not now"
        const must_sign = !sig && !!k.app_signup_at && !!s.signup_required_from && new Date(k.app_signup_at) >= new Date(s.signup_required_from);
        out.push({ id: k.id, first_name: k.first_name, last_name: k.last_name, age: k.age, own_login: k.user_id === user.id, signature: sig, must_sign });
      }
      return json({ setting: s, waiver: await waiverText(s.version), athletes: out });
    }
    if (body.action === "sign") {
      const { data: a } = await admin.from("athletes").select("id, first_name, last_name, age, parent_id, user_id, archived_at").eq("id", String(body.athlete_id || "")).maybeSingle();
      if (!a || a.archived_at || (a.parent_id !== user.id && a.user_id !== user.id)) return bad("not your athlete", 403);
      return await record(req, a, body, s, { method: "app", user });
    }
    return bad("unknown action", 404);
  } catch (e) {
    console.error(e);
    return bad("server error", 500);
  }
});
