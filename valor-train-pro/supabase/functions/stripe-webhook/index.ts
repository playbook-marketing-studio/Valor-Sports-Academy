// ════════════════════════════════════════════════════════════════════════
// Edge Function · stripe-webhook  (Valor Train Pro)
// Stripe → POST here. Signature verified with STRIPE_WEBHOOK_SECRET.
//   checkout.session.completed / async_payment_succeeded → payments row paid
//     (+ stripe customer / subscription ids for monthly plans)
//   checkout.session.expired / async_payment_failed      → payments row canceled
//   invoice.paid (billing_reason subscription_cycle)      → a new paid row for each
//     month after the first, so the staff screen shows renewals
// Idempotent on re-delivery.
// Stripe → Developers → Webhooks → https://gpotwyuttkkygvxzktep.supabase.co/functions/v1/stripe-webhook
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt --project-ref gpotwyuttkkygvxzktep --use-api
// ════════════════════════════════════════════════════════════════════════
import Stripe from "npm:stripe@17.7.0";
import { admin, bad } from "../_shared/common.ts";

const cryptoProvider = Stripe.createSubtleCryptoProvider();

Deno.serve(async (req) => {
  if (req.method !== "POST") return bad("POST only", 405);
  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) return bad("webhook secret not configured", 500);
  const sig = req.headers.get("stripe-signature");
  if (!sig) return bad("missing signature", 400);
  const raw = await req.text();
  const stripe = new Stripe(Deno.env.get("STRIPE_SECRET_KEY") || "sk_test_placeholder", {
    apiVersion: "2025-02-24.acacia", httpClient: Stripe.createFetchHttpClient(),
  });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, secret, undefined, cryptoProvider);
  } catch (e) {
    console.error("bad signature", (e as Error).message);
    return bad("bad signature", 400);
  }

  try {
    const obj = event.data.object as Record<string, any>;
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const paymentId = obj.metadata?.payment_id || obj.client_reference_id;
        if (!paymentId) break;
        const paid = event.type === "checkout.session.async_payment_succeeded" || obj.payment_status === "paid" || obj.payment_status === "no_payment_required";
        const patch: Record<string, unknown> = {
          stripe_checkout_session_id: obj.id,
          stripe_customer_id: typeof obj.customer === "string" ? obj.customer : null,
          stripe_subscription_id: typeof obj.subscription === "string" ? obj.subscription : null,
        };
        if (paid) { patch.status = "paid"; patch.paid_at = new Date().toISOString(); }
        await admin.from("payments").update(patch).eq("id", paymentId).neq("status", "paid");
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const paymentId = obj.metadata?.payment_id || obj.client_reference_id;
        if (paymentId) await admin.from("payments").update({ status: "canceled" }).eq("id", paymentId).eq("status", "pending");
        break;
      }
      case "invoice.paid": {
        if (obj.billing_reason !== "subscription_cycle") break; // month one is recorded by checkout
        const subId = typeof obj.subscription === "string" ? obj.subscription : obj.subscription?.id;
        if (!subId) break;
        const { data: first } = await admin.from("payments").select("*").eq("stripe_subscription_id", subId)
          .order("created_at", { ascending: true }).limit(1).maybeSingle();
        if (!first) break;
        const note = `invoice ${obj.id}`;
        const { data: dupe } = await admin.from("payments").select("id").eq("note", note).maybeSingle();
        if (dupe) break;
        await admin.from("payments").insert({
          athlete_id: first.athlete_id, parent_id: first.parent_id, plan_key: first.plan_key, description: first.description,
          amount_cents: obj.amount_paid ?? first.amount_cents, kind: "subscription", method: "card", status: "paid",
          paid_at: new Date().toISOString(), stripe_subscription_id: subId, stripe_customer_id: first.stripe_customer_id, note,
        });
        break;
      }
      default:
    }
  } catch (e) {
    console.error("webhook handling failed", e);
    return bad("handler error", 500);
  }
  return new Response(JSON.stringify({ received: true }), { headers: { "content-type": "application/json" } });
});
