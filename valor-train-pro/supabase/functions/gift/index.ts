// ════════════════════════════════════════════════════════════════════════
// Edge Function · gift  (Valor Train Pro) — buy classes as a gift, claim them with a code (Omar 11/27/2026,
// Black Friday: "gift 3 classes", a voucher they can screenshot or save, email optional).
// Separate from fn family / staff / stripe-webhook on purpose: nothing that already takes money changes.
//   POST {action:"peek", code}                 (no login) → what the code is for, or 404
//   POST {action:"buy", item_key, from_name, to_name?, to_email?, note?}
//                                              → Stripe Checkout (one-time) for a settings item with giftable:true
//   POST {action:"voucher", id}                (giver) → the gift + its code once paid. Confirms the payment with
//                                                Stripe itself (no webhook change); the first time it's paid,
//                                                Valor gets an alert and the optional email goes out.
//   POST {action:"email", id, to_email}        (giver) → send (or resend) the gift email
//   POST {action:"claim", code, athlete_id}    → puts the classes on the caller's athlete as an ordinary paid
//                                                payments row (classes_total + covers_until), once per code
// Gift money shows up in payments when it's claimed. A refund in Stripe before the claim blocks the code;
// after the claim the existing charge.refunded webhook finds the payments row by its payment intent.
// Deploy: supabase functions deploy gift --no-verify-jwt --project-ref gpotwyuttkkygvxzktep --use-api
// ════════════════════════════════════════════════════════════════════════
import { admin, appOrigin, bad, cors, enrollmentConfig, json, userFromRequest } from "../_shared/common.ts";
import { stripeClient } from "../_shared/checkout.ts";
import { ptToUtc } from "../_shared/billing.ts";
import { btn, esc, mailConfigured, sendMail, wrapHtml } from "../_shared/mail.ts";

const TEST_ONLY = "omar@playbookmarketing.studio";
const ALPHABET = "ABCDEFGHJKMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I/L
const clean = (v: unknown, max = 60) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
const normCode = (v: unknown) => String(v ?? "").toUpperCase().replace(/[^A-Z0-9]/g, ""); // "7k3m q9xp" = 7K3MQ9XP
const fmtCode = (c: string) => `${c.slice(0, 4)}-${c.slice(4)}`;
const money = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const fmtDay = (iso: string | null) => iso ? new Date(new Date(iso).getTime() - 1000).toLocaleDateString("en-US", { timeZone: "America/Los_Angeles", month: "short", day: "numeric", year: "numeric" }) : "";

function newCode() {
  const out: string[] = [];
  const buf = new Uint8Array(32);
  while (out.length < 8) {
    crypto.getRandomValues(buf);
    for (const b of buf) { if (b < 248 && out.length < 8) out.push(ALPHABET[b % 31]); } // 248 = 31*8, no bias
  }
  return out.join("");
}

/** End of the item's expires_on day in Pacific time ("2027-01-31" → Feb 1 00:00 PT), else now + expires_days. */
function giftExpiry(item: Record<string, any>, from: Date) {
  if (typeof item.expires_on === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item.expires_on)) {
    const [y, m, d] = item.expires_on.split("-").map(Number);
    const next = new Date(Date.UTC(y, m - 1, d + 1));
    return ptToUtc(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate(), 0).toISOString();
  }
  const days = Number(item.expires_days) || 0;
  return days > 0 ? new Date(from.getTime() + days * 86400000).toISOString() : null;
}

async function staffTo(testOnly: boolean) {
  if (testOnly) return [TEST_ONLY];
  const { data } = await admin.from("staff_allowlist").select("email");
  return [...new Set((data || []).map((r) => String(r.email).toLowerCase()).filter((e) => e && !e.endsWith(".test")))];
}
/** Send once per key (message_alerts), like the other app alerts. */
async function once(key: string, mail: Parameters<typeof sendMail>[0]) {
  if (!mailConfigured()) return false;
  const { error } = await admin.from("message_alerts").insert({ key });
  if (error) return false; // duplicate = already sent
  try { await sendMail(mail); return true; } catch (e) { await admin.from("message_alerts").delete().eq("key", key); console.error("gift mail", e); return false; }
}
const appUrl = () => (Deno.env.get("APP_URL") || "https://app.valorsportsacademywa.com").replace(/\/$/, "");
const giverEmail = async (g: any) => g.giver_id ? ((await admin.auth.admin.getUserById(g.giver_id)).data?.user?.email || "").toLowerCase() : "";

async function alertStaff(g: any, kind: "bought" | "claimed", extra = "") {
  const test = (await giverEmail(g)).endsWith(".test");
  const subject = kind === "bought" ? `Gift bought: ${g.item_name} from ${g.from_name || "someone"}` : `Gift claimed: ${g.item_name} for ${extra}`;
  const lines = kind === "bought"
    ? `${g.from_name || "Someone"} bought ${g.item_name} (${money(g.amount_cents)}) as a gift${g.to_name ? ` for ${g.to_name}` : ""}. Code ${fmtCode(g.code)}. It shows up on an athlete when the family claims it in the app.`
    : `${extra} now has the ${g.classes} gift classes from ${g.from_name || "a gift"} (code ${fmtCode(g.code)}), good through ${fmtDay(g.expires_at)}.`;
  await once(`gift:${g.id}:${kind}`, { to: await staffTo(test), subject, text: lines, html: wrapHtml(subject, `<p>${esc(lines)}</p>`) });
}

async function emailRecipient(req: Request, g: any, to: string) {
  const link = `${appOrigin(req)}/gift/${fmtCode(g.code)}`;
  const from = g.from_name || "Someone";
  const subject = `${from} gave you ${g.classes ? `${g.classes} classes` : "classes"} at Valor Sports Academy`;
  const good = g.expires_at ? `, good through ${fmtDay(g.expires_at)}` : "";
  const forWho = g.to_name ? ` for ${g.to_name}` : "";
  const text = `${from} got you ${g.classes} classes at Valor Sports Academy${forWho}${good}.${g.note ? ` "${g.note}"` : ""} To use it, open ${link} , sign in or make an account, and pick your athlete. Your code is ${fmtCode(g.code)}. Then just show up to any class.`;
  const html = wrapHtml(subject,
    `<p>${esc(from)} got you ${esc(g.classes)} classes at Valor Sports Academy${esc(forWho)}${esc(good)}.</p>
     ${g.note ? `<p style="font-style:italic">"${esc(g.note)}"</p>` : ""}
     <p>Tap the button, sign in or make an account, and pick your athlete. Then just show up to any class.</p>
     ${btn(link, "Claim the classes")}
     <p>Your code: <strong style="font-size:18px;letter-spacing:2px">${esc(fmtCode(g.code))}</strong></p>`,
    "Questions? Email Valor.");
  await sendMail({ to, subject, text, html });
  await admin.from("gifts").update({ to_email: to, emailed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", g.id);
}

/** pending → paid once Stripe says so (the success page, or the giver reopening the voucher). */
async function refresh(req: Request, g: any) {
  if (g.status !== "pending" || !g.stripe_checkout_session_id) return g;
  const s = await stripeClient().checkout.sessions.retrieve(g.stripe_checkout_session_id);
  if (s.status === "expired") {
    const { data } = await admin.from("gifts").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("id", g.id).eq("status", "pending").select("*").maybeSingle();
    return data || g;
  }
  if (s.payment_status !== "paid") return g;
  const { data: moved } = await admin.from("gifts").update({
    status: "paid", paid_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    stripe_payment_intent_id: typeof s.payment_intent === "string" ? s.payment_intent : null,
  }).eq("id", g.id).eq("status", "pending").select("*").maybeSingle();
  if (!moved) return (await admin.from("gifts").select("*").eq("id", g.id).maybeSingle()).data || g;
  try { await alertStaff(moved, "bought"); } catch (e) { console.error("gift alert", e); }
  if (moved.to_email) { try { await emailRecipient(req, moved, moved.to_email); } catch (e) { console.error("gift email", e); } }
  return (await admin.from("gifts").select("*").eq("id", g.id).maybeSingle()).data || moved;
}

/** What the giver sees. The code only once it's paid. */
const forGiver = (g: any) => ({
  id: g.id, status: g.status, item_name: g.item_name, classes: g.classes, amount_cents: g.amount_cents,
  from_name: g.from_name, to_name: g.to_name, to_email: g.to_email, note: g.note, expires_at: g.expires_at,
  emailed_at: g.emailed_at, claimed_at: g.claimed_at, code: ["paid", "claimed"].includes(g.status) ? fmtCode(g.code) : null,
});

async function byCode(code: unknown) {
  const c = normCode(code);
  if (c.length !== 8) return null;
  const { data } = await admin.from("gifts").select("*").eq("code", c).maybeSingle();
  return data;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return bad("POST only", 405);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad("invalid json"); }
  try {
    if (body.action === "peek") {
      const g = await byCode(body.code);
      if (!g || !["paid", "claimed", "refunded"].includes(g.status)) return bad("That code doesn't match a gift. Check it and try again.", 404);
      return json({ status: g.status, item_name: g.item_name, classes: g.classes, from_name: g.from_name, to_name: g.to_name, note: g.note, expires_at: g.expires_at, code: fmtCode(g.code) });
    }

    const user = await userFromRequest(req);
    if (!user) return bad("sign in first", 401);

    if (body.action === "buy") {
      const cfg = await enrollmentConfig();
      const item = cfg.items.find((x: any) => x.key === String(body.item_key || "") && x.giftable && x.billing !== "monthly") as any;
      if (!item || !(item.amount_cents >= 50)) return bad("That gift isn't available right now.");
      const from_name = clean(body.from_name, 60);
      if (!from_name) return bad("add who it's from");
      const to_email = clean(body.to_email, 120).toLowerCase();
      if (to_email && !isEmail(to_email)) return bad("that email doesn't look right");
      // a few unpaid tries are fine; a pile of them is not
      const { count } = await admin.from("gifts").select("id", { count: "exact", head: true }).eq("giver_id", user.id).eq("status", "pending").gte("created_at", new Date(Date.now() - 3600000).toISOString());
      if ((count || 0) >= 8) return bad("Too many tries in a row. Wait a bit, or call Valor.", 429);
      const now = new Date();
      let g: any = null;
      for (let i = 0; i < 5 && !g; i++) {
        const { data, error } = await admin.from("gifts").insert({
          code: newCode(), item_key: item.key, item_name: item.name, amount_cents: item.amount_cents, classes: item.classes ?? null,
          expires_at: giftExpiry(item, now), giver_id: user.id, from_name, to_name: clean(body.to_name, 60) || null,
          to_email: to_email || null, note: clean(body.note, 200) || null,
        }).select("*").single();
        if (data) g = data; else if (error && error.code !== "23505") return bad(error.message, 500);
      }
      if (!g) return bad("Could not make a gift code. Try again.", 500);
      const origin = appOrigin(req);
      try {
        const session = await stripeClient().checkout.sessions.create({
          mode: "payment",
          customer_email: user.email || undefined,
          line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: item.amount_cents, product_data: { name: `Valor Sports Academy: ${item.name} (gift)`, description: g.to_name ? `Gift for ${g.to_name}` : "Gift" } } }],
          metadata: { gift_id: g.id, kind: "gift" },
          payment_intent_data: { metadata: { gift_id: g.id, kind: "gift" } },
          success_url: `${origin}/gift/voucher/${g.id}`,
          cancel_url: `${origin}/gift/buy?canceled=1`,
        });
        await admin.from("gifts").update({ stripe_checkout_session_id: session.id }).eq("id", g.id);
        return json({ url: session.url, id: g.id });
      } catch (e) {
        await admin.from("gifts").update({ status: "canceled" }).eq("id", g.id);
        return bad(`Stripe error: ${(e as Error).message}`, 502);
      }
    }

    if (body.action === "voucher" || body.action === "email") {
      const { data: g0 } = await admin.from("gifts").select("*").eq("id", String(body.id || "")).maybeSingle();
      if (!g0 || g0.giver_id !== user.id) return bad("gift not found", 404);
      const g = await refresh(req, g0);
      if (body.action === "email") {
        const to = clean(body.to_email, 120).toLowerCase();
        if (!isEmail(to)) return bad("that email doesn't look right");
        if (g.status !== "paid") return bad(g.status === "claimed" ? "This gift was already claimed." : "The payment hasn't gone through yet.", 409);
        if (!mailConfigured()) return bad("Email isn't connected right now. Save the voucher and send it yourself.", 503);
        const { error: dup } = await admin.from("message_alerts").insert({ key: `gift-email:${g.id}:${Math.floor(Date.now() / 120000)}` });
        if (dup) return bad("Just sent. Give it a minute before sending again.", 429);
        await emailRecipient(req, g, to);
        return json({ sent: true, gift: forGiver((await admin.from("gifts").select("*").eq("id", g.id).single()).data) });
      }
      return json({ gift: forGiver(g) });
    }

    if (body.action === "claim") {
      const g = await byCode(body.code);
      if (!g || !["paid", "claimed", "refunded"].includes(g.status)) return bad("That code doesn't match a gift. Check it and try again.", 404);
      if (g.status === "claimed") return bad("This gift was already used.", 409);
      if (g.status === "refunded") return bad("This gift was refunded, so it can't be used.", 409);
      if (g.expires_at && new Date(g.expires_at) <= new Date()) return bad("This gift expired.", 410);
      const athleteId = String(body.athlete_id || "");
      const { data: a } = await admin.from("athletes").select("id, first_name, last_name, parent_id, user_id, archived_at").eq("id", athleteId).maybeSingle();
      if (!a || a.archived_at || (a.parent_id !== user.id && a.user_id !== user.id)) return bad("pick one of your athletes", 403);
      // refunded in Stripe before anyone claimed it: the code is dead
      if (g.stripe_payment_intent_id) {
        const pi = await stripeClient().paymentIntents.retrieve(g.stripe_payment_intent_id, { expand: ["latest_charge"] });
        const ch: any = pi.latest_charge;
        if (pi.status !== "succeeded" || (ch && ch.amount_refunded > 0)) {
          await admin.from("gifts").update({ status: "refunded", updated_at: new Date().toISOString() }).eq("id", g.id).eq("status", "paid");
          return bad("This gift was refunded, so it can't be used.", 409);
        }
      }
      // claim first (one winner per code), then the payments row; undo the claim if the row fails
      const nowIso = new Date().toISOString();
      const { data: won } = await admin.from("gifts").update({ status: "claimed", claimed_at: nowIso, claimed_by: user.id, claimed_athlete_id: a.id, updated_at: nowIso })
        .eq("id", g.id).eq("status", "paid").select("*").maybeSingle();
      if (!won) return bad("This gift was already used.", 409);
      const name = [a.first_name, a.last_name].filter(Boolean).join(" ");
      const { data: pay, error } = await admin.from("payments").insert({
        athlete_id: a.id, parent_id: a.parent_id, plan_key: g.item_key, description: `${g.item_name} (gift) · ${name}`,
        amount_cents: g.amount_cents, kind: "one_time", method: "card", status: "paid", paid_at: g.paid_at || nowIso,
        classes_total: g.classes ?? null, covers_until: g.expires_at, stripe_checkout_session_id: g.stripe_checkout_session_id,
        stripe_payment_intent_id: g.stripe_payment_intent_id, note: `Gift from ${g.from_name || "someone"} · code ${fmtCode(g.code)}`,
      }).select("id").single();
      if (error || !pay) {
        await admin.from("gifts").update({ status: "paid", claimed_at: null, claimed_by: null, claimed_athlete_id: null }).eq("id", g.id);
        return bad(error?.message || "Could not add the classes. Try again.", 500);
      }
      await admin.from("gifts").update({ claimed_payment_id: pay.id }).eq("id", g.id);
      try { await alertStaff(won, "claimed", name); } catch (e) { console.error("gift alert", e); }
      return json({ claimed: true, athlete: a.first_name, classes: g.classes, expires_at: g.expires_at });
    }

    return bad("unknown action", 404);
  } catch (e) {
    console.error(e);
    return bad("server error", 500);
  }
});
