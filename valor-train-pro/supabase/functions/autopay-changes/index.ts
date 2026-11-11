// ════════════════════════════════════════════════════════════════════════
// Edge Function · autopay-changes  (Valor Train Pro) — coaches change a family's autopay (Omar 11/11/2026)
//   POST {action:"change_plan", subscription_id, plan_key}
//        → the new monthly plan and price start at the NEXT charge. Nothing is charged or refunded today,
//          this month's classes stay as they are, and the commitment count carries over.
//   POST {action:"change_date", subscription_id, date:"YYYY-MM-DD"}
//        → the next charge moves to that date (9am Pacific) and then repeats on that day every month.
//          Nothing is charged today; classes stay usable until the new date.
//   Coaches only. The parent gets an email saying what changed (the Live example athlete emails Omar only).
//   Its own function on purpose: `staff` runs Start autopay / Update card / Cancel for every family and
//   is not touched by this.
// Deploy: supabase functions deploy autopay-changes --no-verify-jwt --project-ref gpotwyuttkkygvxzktep --use-api
// ════════════════════════════════════════════════════════════════════════
import { admin, appOrigin, bad, cors, enrollmentConfig, json, userFromRequest } from "../_shared/common.ts";
import { CHARGE_HOUR, coverUntil, fmtDayPT, isMonthly, ptToUtc } from "../_shared/billing.ts";
import { btn, esc, mailConfigured, sendMail, wrapHtml } from "../_shared/mail.ts";

const TEST_ONLY = "omar@playbookmarketing.studio";
const API = (Deno.env.get("STRIPE_API_BASE") || "https://api.stripe.com").replace(/\/$/, "");
const money = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] || "th"}`;

class StripeError extends Error { constructor(message: string, public status: number) { super(message); } }
/** One Stripe call. `params` is already flat ("items[0][id]": "..."). */
async function stripe(method: "GET" | "POST", path: string, params?: Record<string, string>) {
  const res = await fetch(`${API}${path}`, {
    method, headers: { authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")}`, ...(params ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new StripeError(data?.error?.message || `Stripe error ${res.status}`, res.status);
  return data;
}

/** The autopay row, its athlete and its live Stripe subscription, or the reason it can't be changed. */
async function load(subId: string) {
  const { data: sub } = await admin.from("subscriptions").select("*").eq("id", subId).maybeSingle();
  if (!sub) return { error: bad("autopay not found", 404) };
  if (sub.status === "past_due") return { error: bad("The last charge failed. Get the card fixed first, then change it.", 409) };
  if (sub.status !== "active" || !sub.stripe_subscription_id) return { error: bad("This autopay isn't active", 409) };
  if (sub.cancel_at_period_end) return { error: bad("This autopay is set to end. Tap Keep autopay on first.", 409) };
  const { data: a } = await admin.from("athletes").select("id, first_name, last_name, parent_id, parent_email, parent_name, is_example").eq("id", sub.athlete_id).maybeSingle();
  const s = await stripe("GET", `/v1/subscriptions/${sub.stripe_subscription_id}`);
  if (!["active", "trialing"].includes(s.status)) return { error: bad("Stripe shows this autopay as not active", 409) };
  return { sub, a: (a || {}) as Record<string, any>, s };
}

async function tellParent(req: Request, a: Record<string, any>, subject: string, lines: string[]) {
  let to = String(a.parent_email || "").toLowerCase();
  if (a.parent_id) {
    const { data: p } = await admin.from("profiles").select("email").eq("id", a.parent_id).maybeSingle();
    to = String(p?.email || to).toLowerCase();
  }
  if (a.is_example) to = TEST_ONLY;
  if (!to || to.endsWith(".test") || !mailConfigured()) return false;
  const origin = (Deno.env.get("APP_URL") || appOrigin(req)).replace(/\/$/, "");
  const hi = String(a.parent_name || "").trim().split(/\s+/)[0];
  try {
    await sendMail({
      to, subject,
      text: `${hi ? `Hi ${hi}, ` : ""}${lines.join(" ")} Nothing is charged today. See it in the app: ${origin}/account Questions? Text 509-987-4612.`,
      html: wrapHtml(subject, `<p>${hi ? `Hi ${esc(hi)}, ` : ""}${lines.map(esc).join("<br>")}</p><p>Nothing is charged today.</p>${btn(`${origin}/account`, "See it in the app")}`,
        "Questions? Reply to this email or text 509-987-4612."),
    });
    return true;
  } catch (e) { console.error("autopay change mail failed", (e as Error).message); return false; }
}

async function changePlan(req: Request, staffId: string, body: Record<string, any>) {
  const r = await load(String(body.subscription_id || ""));
  if (r.error) return r.error;
  const { sub, a, s } = r;
  const cfg = await enrollmentConfig();
  const item = cfg.items.find((x) => x.key === body.plan_key && isMonthly(x as any));
  if (!item || !(item.amount_cents >= 50)) return bad("pick a monthly plan");
  if (item.key === sub.plan_key && item.amount_cents === sub.amount_cents) return bad("They're already on that plan", 409);
  const line = s.items?.data?.[0];
  const product = typeof line?.price?.product === "string" ? line.price.product : line?.price?.product?.id;
  if (!line?.id || !product) return bad("Stripe's copy of this autopay looks different than expected. Text Omar.", 409);
  const athlete = [a.first_name, a.last_name].filter(Boolean).join(" ");

  await stripe("POST", `/v1/subscriptions/${s.id}`, {
    "items[0][id]": line.id,
    "items[0][price_data][currency]": "usd",
    "items[0][price_data][product]": product,
    "items[0][price_data][unit_amount]": String(item.amount_cents),
    "items[0][price_data][recurring][interval]": "month",
    proration_behavior: "none",
    description: `${item.name} · ${athlete}`,
    "metadata[plan_key]": item.key,
  });
  // the product belongs to this one autopay (Checkout made it); its name is what the receipt says
  let receipt_name = true;
  try { await stripe("POST", `/v1/products/${product}`, { name: `Valor Sports Academy: ${item.name}` }); } catch (e) { receipt_name = false; console.error("product rename failed", (e as Error).message); }

  const { error } = await admin.from("subscriptions").update({
    plan_key: item.key, plan_name: item.name, amount_cents: item.amount_cents, classes_per_month: item.classes ?? null, updated_at: new Date().toISOString(),
  }).eq("id", sub.id);
  if (error) return bad("Stripe is changed but the app didn't save it. Text Omar.", 500);
  const next = sub.current_period_end ? fmtDayPT(sub.current_period_end) : "the next charge";
  const parent_emailed = await tellParent(req, a, "Your Valor plan changed", [
    `A coach changed ${a.first_name || "your athlete"}'s plan to ${item.name}.`,
    `Your next payment is ${money(item.amount_cents)} on ${next}, then ${money(item.amount_cents)} every month.`,
  ]);
  console.log("autopay plan changed", sub.id, sub.plan_key, "->", item.key, "by", staffId);
  return json({ ok: true, plan_name: item.name, amount_cents: item.amount_cents, next_charge_at: sub.current_period_end, parent_emailed, receipt_name });
}

async function changeDate(req: Request, staffId: string, body: Record<string, any>) {
  const date = String(body.date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return bad("pick a date");
  const [y, m, d] = date.split("-").map(Number);
  const when = ptToUtc(y, m, d, CHARGE_HOUR);
  if (Number.isNaN(when.getTime())) return bad("that date doesn't look right");
  if (when.getTime() - Date.now() < 48 * 3600000) return bad("pick a date at least 2 days out");
  if (when.getTime() - Date.now() > 62 * 86400000) return bad("pick a date within the next 2 months");
  const r = await load(String(body.subscription_id || ""));
  if (r.error) return r.error;
  const { sub, a, s } = r;
  if (sub.current_period_end && Math.abs(new Date(sub.current_period_end).getTime() - when.getTime()) < 3600000) return bad("That's already the charge date", 409);

  // moving the end of the free stretch moves the next charge, and the monthly day with it. No charge, no credit.
  await stripe("POST", `/v1/subscriptions/${s.id}`, { trial_end: String(Math.floor(when.getTime() / 1000)), proration_behavior: "none" });
  const { error } = await admin.from("subscriptions").update({ current_period_end: when.toISOString(), updated_at: new Date().toISOString() }).eq("id", sub.id);
  if (error) return bad("Stripe is changed but the app didn't save it. Text Omar.", 500);
  // a later date: this month's classes stay usable until then (never shortened)
  const { data: packs } = await admin.from("payments").select("id, covers_until").eq("subscription_id", sub.id).eq("status", "paid").gt("covers_until", new Date().toISOString());
  for (const p of packs || []) {
    if (new Date(p.covers_until) < new Date(coverUntil(when))) await admin.from("payments").update({ covers_until: coverUntil(when) }).eq("id", p.id);
  }
  const parent_emailed = await tellParent(req, a, "Your Valor payment date changed", [
    `A coach moved ${a.first_name || "your athlete"}'s payment date.`,
    `Your next payment is ${money(sub.amount_cents)} on ${fmtDayPT(when)}, then on the ${ordinal(d)} of every month.`,
  ]);
  console.log("autopay date changed", sub.id, sub.current_period_end, "->", when.toISOString(), "by", staffId);
  return json({ ok: true, next_charge_at: when.toISOString(), parent_emailed });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return bad("POST only", 405);
  const user = await userFromRequest(req);
  if (!user) return bad("sign in first", 401);
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (prof?.role !== "admin") return bad("coaches only", 403);
  if (!Deno.env.get("STRIPE_SECRET_KEY")) return json({ configured: false });
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return bad("invalid json"); }
  try {
    if (body.action === "change_plan") return await changePlan(req, user.id, body);
    if (body.action === "change_date") return await changeDate(req, user.id, body);
    return bad("unknown action", 404);
  } catch (e) {
    if (e instanceof StripeError) { console.error("stripe refused", body.action, e.message); return bad(`Stripe said no: ${e.message}`, 502); }
    console.error("autopay-changes failed", body?.action, e);
    return bad("server error", 500);
  }
});
