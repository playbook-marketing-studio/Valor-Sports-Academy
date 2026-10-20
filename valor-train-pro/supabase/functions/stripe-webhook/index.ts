// ════════════════════════════════════════════════════════════════════════
// Edge Function · stripe-webhook  (Valor Train Pro)
// Stripe → POST here. Signature verified with STRIPE_WEBHOOK_SECRET.
// Stripe only charges one-time classes / class packs (no subscriptions, Omar 9/23).
//   checkout.session.completed / async_payment_succeeded → payments row paid (unlocks content);
//       covers_until = expiry when the item has expires_days
//   checkout.session.expired / async_payment_failed      → payments row canceled
//   charge.refunded                                       → payments row refunded (locks content)
// A row that actually moves to paid or refunded emails the coaches (_shared/alerts.ts); mail errors never fail the webhook.
// Monthly autopay (10/20/2026, _shared/billing.ts):
//   checkout.session.completed (mode subscription) → subscriptions row gets its Stripe ids, status active
//   invoice.paid            → a payments row (kind subscription) with that month's classes, valid to the next
//                             charge + 3 days; last month's leftover classes close; paid_months counts full months
//   invoice.payment_failed  → past_due + emails coaches and the parent (update card)
//   customer.subscription.updated / deleted → status, next charge, cancel-at-end, canceled
// Test events: ids starting evt_selftest_ (signed with our secret; real Stripe ids never look like this) update
// the database but send NO emails, so test runs don't flood Omar's inbox (10/20/2026).
// The account sends 2026-09-30 payloads (invoice.parent.subscription_details, items[].current_period_end);
// the older top-level fields are read too.
// Idempotent on re-delivery.
// Stripe → Developers → Webhooks → https://gpotwyuttkkygvxzktep.supabase.co/functions/v1/stripe-webhook
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt --project-ref gpotwyuttkkygvxzktep --use-api
// ════════════════════════════════════════════════════════════════════════
import Stripe from "npm:stripe@17.7.0";
import { admin, bad, expiryFrom } from "../_shared/common.ts";
import { alertForPayment, alertForSubscription } from "../_shared/alerts.ts";
import { coverUntil, fmtDayPT } from "../_shared/billing.ts";

const alertSafely = async (ids: string[], kind: "paid" | "refunded", quiet = false) => {
  if (quiet) return;
  for (const id of ids) {
    try { console.log("alert", kind, id, JSON.stringify(await alertForPayment(id, kind))); } catch (e) { console.error("payment alert failed", id, e); }
  }
};

const cryptoProvider = Stripe.createSubtleCryptoProvider();

const STATUS_MAP: Record<string, string> = { active: "active", trialing: "active", past_due: "past_due", unpaid: "past_due", canceled: "canceled", incomplete: "pending", incomplete_expired: "expired", paused: "past_due" };
const ts = (n: unknown) => (typeof n === "number" && n > 0 ? new Date(n * 1000) : null);
const idOf = (v: unknown) => (typeof v === "string" ? v : (v as any)?.id || null);

/** Our subscriptions row for a Stripe subscription / invoice (by metadata first, then Stripe id). */
async function findSub(stripeSubId: string | null, meta: Record<string, any> | null | undefined) {
  const rowId = meta?.subscription_row_id;
  if (rowId) {
    const { data } = await admin.from("subscriptions").select("*").eq("id", rowId).maybeSingle();
    if (data) return data;
  }
  if (stripeSubId) {
    const { data } = await admin.from("subscriptions").select("*").eq("stripe_subscription_id", stripeSubId).maybeSingle();
    if (data) return data;
  }
  return null;
}
const invoiceSubId = (inv: any) => idOf(inv.parent?.subscription_details?.subscription) || idOf(inv.subscription) || null;
const invoiceMeta = (inv: any) => inv.parent?.subscription_details?.metadata || inv.subscription_details?.metadata
  || inv.lines?.data?.find((l: any) => l.metadata?.subscription_row_id)?.metadata || null;
/** End of the paid period: the latest line period end (the anchor for a first, prorated invoice). */
const invoicePeriodEnd = (inv: any) => {
  const ends = (inv.lines?.data || []).map((l: any) => l.period?.end).filter((n: any) => typeof n === "number");
  return ts(ends.length ? Math.max(...ends) : inv.period_end);
};
async function invoicePaymentIntent(inv: any): Promise<string | null> {
  const direct = idOf(inv.payment_intent);
  if (direct) return direct;
  try { // 2025-03-31+ invoices list their payments separately
    const r = await fetch(`https://api.stripe.com/v1/invoice_payments?invoice=${encodeURIComponent(inv.id)}&limit=1`, { headers: { Authorization: `Bearer ${Deno.env.get("STRIPE_SECRET_KEY")}` } });
    const d = await r.json();
    return idOf(d?.data?.[0]?.payment?.payment_intent);
  } catch { return null; }
}
const subPeriodEnd = (s: any) => ts(s.current_period_end) || ts(s.items?.data?.[0]?.current_period_end);

async function onInvoicePaid(inv: any, quiet: boolean) {
  const sub = await findSub(invoiceSubId(inv), invoiceMeta(inv));
  if (!sub) { console.log("invoice.paid: no subscription row", inv.id); return; }
  const { data: dupe } = await admin.from("payments").select("id").eq("stripe_invoice_id", inv.id).maybeSingle();
  if (dupe) return; // re-delivery
  const first = inv.billing_reason === "subscription_create";
  const periodEnd = invoicePeriodEnd(inv) || new Date(Date.now() + 31 * 86400000);
  const classes = first && sub.first_month_classes ? sub.first_month_classes : sub.classes_per_month;
  const { data: a } = await admin.from("athletes").select("first_name, last_name").eq("id", sub.athlete_id).maybeSingle();
  const now = new Date();
  // a partial first month (signed up mid-month) doesn't count toward the commitment
  const fullMonth = !first || !sub.first_month_classes || sub.first_month_classes >= (sub.classes_per_month || 0);
  const { data: pay, error } = await admin.from("payments").insert({
    athlete_id: sub.athlete_id, parent_id: sub.parent_id, plan_key: sub.plan_key, subscription_id: sub.id,
    description: `${sub.plan_name} · ${[a?.first_name, a?.last_name].filter(Boolean).join(" ")} · through ${fmtDayPT(new Date(periodEnd.getTime() - 86400000))}`,
    amount_cents: inv.amount_paid ?? inv.total ?? 0, kind: "subscription", method: "card", status: "paid", paid_at: now.toISOString(),
    stripe_invoice_id: inv.id, stripe_subscription_id: invoiceSubId(inv), stripe_customer_id: idOf(inv.customer),
    stripe_payment_intent_id: await invoicePaymentIntent(inv),
    classes_total: classes ?? null, covers_until: coverUntil(periodEnd),
  }).select("id").single();
  if (error) { if (error.code === "23505") return; throw error; }
  // last month's leftover classes don't roll over (the new month's pack takes over)
  await admin.from("payments").update({ covers_until: now.toISOString() })
    .eq("subscription_id", sub.id).neq("id", pay.id).eq("status", "paid").gt("covers_until", now.toISOString());
  await admin.from("subscriptions").update({
    status: "active", stripe_subscription_id: sub.stripe_subscription_id || invoiceSubId(inv), stripe_customer_id: sub.stripe_customer_id || idOf(inv.customer),
    current_period_end: periodEnd.toISOString(), last_paid_at: now.toISOString(), paid_months: sub.paid_months + (fullMonth ? 1 : 0), updated_at: now.toISOString(),
  }).eq("id", sub.id);
  if (quiet) return;
  try { console.log("alert paid", JSON.stringify(await alertForPayment(pay.id, "paid"))); } catch (e) { console.error("payment alert failed", e); }
}

async function onInvoiceFailed(inv: any, quiet: boolean) {
  const sub = await findSub(invoiceSubId(inv), invoiceMeta(inv));
  if (!sub) return;
  await admin.from("subscriptions").update({ status: "past_due", last_failed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq("id", sub.id);
  if (quiet) return;
  try { console.log("alert failed", JSON.stringify(await alertForSubscription(sub.id, "failed", inv.id))); } catch (e) { console.error("failed alert", e); }
}

async function onSubscriptionChanged(s: any, deleted: boolean, quiet: boolean) {
  const sub = await findSub(s.id, s.metadata);
  if (!sub) return;
  const status = deleted ? "canceled" : STATUS_MAP[s.status] || sub.status;
  const end = subPeriodEnd(s);
  const patch: Record<string, unknown> = {
    status, stripe_subscription_id: s.id, stripe_customer_id: idOf(s.customer) || sub.stripe_customer_id,
    cancel_at_period_end: !!s.cancel_at_period_end, updated_at: new Date().toISOString(),
  };
  if (end) patch.current_period_end = end.toISOString();
  if (status === "canceled") patch.canceled_at = (ts(s.ended_at) || ts(s.canceled_at) || new Date()).toISOString();
  await admin.from("subscriptions").update(patch).eq("id", sub.id);
  if (status === "canceled" && sub.status !== "canceled" && !quiet) {
    try { console.log("alert ended", JSON.stringify(await alertForSubscription(sub.id, "ended", s.id))); } catch (e) { console.error("ended alert", e); }
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return bad("POST only", 405);
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  // until scripts/connect_stripe.sh runs, the secret is a placeholder anyone could sign with
  if (!secret || /placeholder/i.test(secret) || !Deno.env.get("STRIPE_SECRET_KEY")) return bad("stripe not connected", 503);
  const sig = req.headers.get("stripe-signature");
  if (!sig) return bad("missing signature", 400);
  const raw = await req.text();
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, {
    apiVersion: "2025-02-24.acacia", httpClient: Stripe.createFetchHttpClient(),
  });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, secret, undefined, cryptoProvider);
  } catch (e) {
    console.error("bad signature", (e as Error).message);
    return bad("bad signature", 400);
  }

  // a self-test event (signed by us, id evt_selftest_*) updates the database but sends no email
  const quiet = String(event.id || "").startsWith("evt_selftest_");
  try {
    const obj = event.data.object as Record<string, any>;
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        if (obj.mode === "subscription") {
          const rowId = obj.metadata?.subscription_row_id || obj.client_reference_id;
          if (rowId) await admin.from("subscriptions").update({
            stripe_checkout_session_id: obj.id, stripe_subscription_id: idOf(obj.subscription), stripe_customer_id: idOf(obj.customer),
            updated_at: new Date().toISOString(),
          }).eq("id", rowId).in("status", ["pending", "active"]);
          // status turns active when the first invoice.paid lands (it carries the classes)
          break;
        }
        const paymentId = obj.metadata?.payment_id || obj.client_reference_id;
        if (!paymentId) break;
        const paid = event.type === "checkout.session.async_payment_succeeded" || obj.payment_status === "paid";
        const patch: Record<string, unknown> = {
          stripe_checkout_session_id: obj.id,
          stripe_customer_id: typeof obj.customer === "string" ? obj.customer : null,
          stripe_payment_intent_id: typeof obj.payment_intent === "string" ? obj.payment_intent : null,
        };
        if (paid) {
          const now = new Date();
          patch.status = "paid"; patch.paid_at = now.toISOString();
          patch.covers_until = expiryFrom(now, Number(obj.metadata?.expires_days) || null);
        }
        // only a pending checkout moves to paid (a late re-delivery must not revive a refunded or canceled row)
        const { data: moved } = await admin.from("payments").update(patch).eq("id", paymentId).eq("status", "pending").select("id");
        if (paid) await alertSafely((moved || []).map((r) => r.id), "paid", quiet);
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        if (obj.mode === "subscription") {
          const rowId = obj.metadata?.subscription_row_id || obj.client_reference_id;
          if (rowId) await admin.from("subscriptions").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", rowId).eq("status", "pending");
          break;
        }
        const paymentId = obj.metadata?.payment_id || obj.client_reference_id;
        if (paymentId) await admin.from("payments").update({ status: "canceled" }).eq("id", paymentId).eq("status", "pending");
        break;
      }
      case "charge.refunded": {
        const pi = typeof obj.payment_intent === "string" ? obj.payment_intent : null;
        const paymentId = obj.metadata?.payment_id;
        let q = admin.from("payments").update({ status: "refunded" }).neq("status", "refunded");
        if (paymentId) q = q.eq("id", paymentId);
        else if (pi) q = q.eq("stripe_payment_intent_id", pi);
        else break;
        const { data: moved } = await q.select("id");
        await alertSafely((moved || []).map((r) => r.id), "refunded", quiet);
        break;
      }
      case "invoice.paid":
        if (invoiceSubId(obj)) await onInvoicePaid(obj, quiet);
        break;
      case "invoice.payment_failed":
        if (invoiceSubId(obj)) await onInvoiceFailed(obj, quiet);
        break;
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await onSubscriptionChanged(obj, event.type === "customer.subscription.deleted", quiet);
        break;
      default:
    }
  } catch (e) {
    console.error("webhook handling failed", e);
    return bad("handler error", 500);
  }
  return new Response(JSON.stringify({ received: true }), { headers: { "content-type": "application/json" } });
});
