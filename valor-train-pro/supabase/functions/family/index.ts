// ════════════════════════════════════════════════════════════════════════
// Edge Function · family  (Valor Train Pro) — a family who signed up in the app on their own can pay
// (Valor 11/9/2026: "there's no option to add a card payment" until the parent comes in for the login QR).
// Sign-up never links a kid by email (9/30 security fix), so a new login starts empty. This gets them going:
//   POST {action:"status"}            → {match:true} when a kid on file has this login's email as the parent
//                                       email and no login yet. No names until they prove the inbox is theirs.
//   POST {action:"send_claim"}        → emails a one-time link (24h) to the login's own address, from Valor's Gmail
//   POST {action:"claim", t}          → the link's token: links every unclaimed kid with that parent email
//   POST {action:"add_athlete", ...}  → "Who's training?": creates the athlete on this login (app_signup_at),
//                                       emails the coaches. The existing plan card + Stripe Checkout take it from there.
//   POST {action:"checkout", athlete_id, plan_key}
//                                     → same Checkout as staff take_payment. A kid added in the app pays the rest of
//                                       this month today (prorate); a kid on file follows the enrollment setting.
//   POST {action:"merge", from_id, into_id}  (staff) → "Same kid as...": moves the app sign-up's login, payments,
//                                       autopay and history onto the roster record and archives the duplicate.
// Deploy: supabase functions deploy family --no-verify-jwt --project-ref gpotwyuttkkygvxzktep --use-api
// ════════════════════════════════════════════════════════════════════════
import { admin, appOrigin, bad, cors, json, userFromRequest } from "../_shared/common.ts";
import { takePayment } from "../_shared/checkout.ts";
import { alertForSignup } from "../_shared/alerts.ts";
import { btn, esc, mailConfigured, sendMail, wrapHtml } from "../_shared/mail.ts";

const MAX_KIDS = 4;
const enc = new TextEncoder();
const b64url = (b: Uint8Array) => btoa(String.fromCharCode(...b)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

async function sign(payload: string) {
  const key = await crypto.subtle.importKey("raw", enc.encode(`claim:${Deno.env.get("FAMILY_CLAIM_SECRET") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64url(new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(payload))));
}
async function makeToken(uid: string, email: string) {
  const exp = Date.now() + 24 * 3600000;
  const body = b64url(enc.encode(JSON.stringify({ uid, email, exp })));
  return `${body}.${await sign(body)}`;
}
async function readToken(t: string) {
  const [body, sig] = String(t || "").split(".");
  if (!body || !sig || sig !== await sign(body)) return null;
  try {
    const p = JSON.parse(atob(body.replace(/-/g, "+").replace(/_/g, "/")));
    return p.exp > Date.now() ? p as { uid: string; email: string; exp: number } : null;
  } catch { return null; }
}

/** Kids on file whose parent email is this login's email and who have no login yet. */
async function unclaimed(email: string) {
  const { data } = await admin.from("athletes").select("id, first_name, last_name, parent_email")
    .is("parent_id", null).is("archived_at", null).not("parent_email", "is", null);
  return (data || []).filter((a) => String(a.parent_email).trim().toLowerCase() === email);
}

const clean = (v: unknown, max = 60) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);

async function addAthlete(user: { id: string; email?: string }, body: Record<string, unknown>) {
  const role = body.role === "athlete" ? "athlete" : body.role === "parent" ? "parent" : "";
  if (!role) return bad("pick I'm the athlete or I'm a parent");
  const first = clean(body.first_name, 40);
  if (!first) return bad("add the athlete's first name");
  const ageN = Number(body.age);
  const age = Number.isInteger(ageN) && ageN >= 4 && ageN <= 60 ? ageN : null;
  const phone = clean(body.phone, 30);
  const { count } = await admin.from("athletes").select("id", { count: "exact", head: true }).eq("parent_id", user.id).is("archived_at", null);
  if ((count || 0) >= MAX_KIDS) return bad("That's a lot of athletes for one login. Call or text 509-987-4612 and we'll add the rest.", 409);
  const { data: prof } = await admin.from("profiles").select("full_name, phone").eq("id", user.id).maybeSingle();
  const email = (user.email || "").toLowerCase();
  const row: Record<string, unknown> = {
    parent_id: user.id, first_name: first, last_name: clean(body.last_name, 40) || null, age,
    sport: clean(body.sport, 40) || null, app_signup_at: new Date().toISOString(), app_signup_role: role,
  };
  if (role === "parent") {
    Object.assign(row, { parent_name: clean(prof?.full_name, 80) || null, parent_email: email || null, parent_phone: phone || prof?.phone || null });
  } else {
    // the athlete's own login: they train under it; a parent's contact (optional) helps the coaches reach whoever pays
    Object.assign(row, {
      user_id: user.id,
      parent_name: clean(body.parent_name, 80) || null,
      parent_phone: clean(body.parent_phone, 30) || null,
      notes: `Signed up in the app by the athlete (${email}${phone ? `, ${phone}` : ""}).`,
    });
  }
  const { data: a, error } = await admin.from("athletes").insert(row).select("*").single();
  if (error) return bad(error.message, 500);
  try { await alertForSignup(a.id, { testOnly: email.endsWith(".test") }); } catch (e) { console.error("signup alert", e); }
  return json({ athlete: a });
}

async function sendClaim(req: Request, user: { id: string; email?: string }) {
  const email = (user.email || "").toLowerCase();
  if (!email) return bad("this login has no email", 409);
  if (!(await unclaimed(email)).length) return json({ sent: false, reason: "no match" });
  if (!mailConfigured()) return bad("Email isn't connected right now. Call or text 509-987-4612.", 503);
  // one email per login per 10 minutes
  const { error: dup } = await admin.from("message_alerts").insert({ key: `claim-email:${user.id}:${Math.floor(Date.now() / 600000)}` });
  if (dup?.code === "23505") return json({ sent: true, throttled: true, email });
  if (dup) return bad(dup.message, 500);
  const link = `${appOrigin(req)}/connect?t=${encodeURIComponent(await makeToken(user.id, email))}`;
  const subject = "Connect your athlete in the Valor app";
  await sendMail({
    to: email, subject,
    text: `Tap this link to connect your athlete to your Valor app login: ${link} It works for 24 hours. Didn't ask for this? You can ignore it. Questions? Text 509-987-4612.`,
    html: wrapHtml(subject,
      `<p>Tap the button to connect your athlete to your Valor app login. Then you can see their workouts and set up their monthly plan.</p>
       ${btn(link, "Connect my athlete")}
       <p style="font-size:13px;color:#6b665c">Button not working? Copy this link into your browser:<br><span style="word-break:break-all">${esc(link)}</span></p>`,
      "The link works for 24 hours. Didn't ask for this? You can ignore it."),
  });
  return json({ sent: true, email });
}

async function claim(user: { id: string; email?: string }, t: string) {
  const p = await readToken(t);
  if (!p) return bad("That link expired or isn't right. Go to Home and tap Email me the link again.", 410);
  const email = (user.email || "").toLowerCase();
  if (p.uid !== user.id || p.email !== email) return bad("That link is for a different login. Sign in with the email it was sent to.", 403);
  const kids = await unclaimed(email);
  if (!kids.length) return json({ linked: [] });
  const ids = kids.map((k) => k.id);
  const { error } = await admin.from("athletes").update({ parent_id: user.id }).in("id", ids).is("parent_id", null);
  if (error) return bad(error.message, 500);
  return json({ linked: kids.map((k) => k.first_name) });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return bad("POST only", 405);
  const user = await userFromRequest(req);
  if (!user) return bad("sign in first", 401);
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isStaff = prof?.role === "admin";
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad("invalid json"); }
  try {
    if (body.action === "merge") {
      if (!isStaff) return bad("staff only", 403);
      const { data, error } = await admin.rpc("merge_athletes", { from_id: String(body.from_id || ""), into_id: String(body.into_id || "") });
      if (error) return bad(error.message, 400);
      return json(data);
    }
    if (isStaff) return bad("This is for family logins. Use the athlete page.", 403);
    const email = (user.email || "").toLowerCase();
    if (body.action === "status") return json({ match: !!email && (await unclaimed(email)).length > 0 });
    if (body.action === "send_claim") return await sendClaim(req, user);
    if (body.action === "claim") return await claim(user, String(body.t || ""));
    if (body.action === "add_athlete") return await addAthlete(user, body);
    if (body.action === "checkout") {
      const athleteId = String(body.athlete_id || "");
      const { data: a } = await admin.from("athletes").select("parent_id, app_signup_at").eq("id", athleteId).maybeSingle();
      if (!a || a.parent_id !== user.id) return bad("not your athlete", 403);
      return await takePayment(req, null, athleteId, String(body.plan_key || ""), false, a.app_signup_at ? "prorate" : "");
    }
    return bad("unknown action", 404);
  } catch (e) {
    console.error(e);
    return bad("server error", 500);
  }
});
