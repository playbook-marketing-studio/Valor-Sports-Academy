// ════════════════════════════════════════════════════════════════════════
// Edge Function · stripe-webhook  (Valor Train Pro)
// Stripe → POST here. Signature verified with STRIPE_WEBHOOK_SECRET.
// Stripe only charges one-time classes / class packs (no subscriptions, Omar 9/23).
//   checkout.session.completed / async_payment_succeeded → payments row paid (unlocks content);
//       covers_until = expiry when the item has expires_days
//   checkout.session.expired / async_payment_failed      → payments row canceled
//   charge.refunded                                       → payments row refunded (locks content)
// Idempotent on re-delivery.
// Stripe → Developers → Webhooks → https://gpotwyuttkkygvxzktep.supabase.co/functions/v1/stripe-webhook
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt --project-ref gpotwyuttkkygvxzktep --use-api
// ════════════════════════════════════════════════════════════════════════
import Stripe from "npm:stripe@17.7.0";
import { admin, bad, expiryFrom } from "../_shared/common.ts";

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
        await admin.from("payments").update(patch).eq("id", paymentId).neq("status", "paid");
        break;
      }
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed": {
        const paymentId = obj.metadata?.payment_id || obj.client_reference_id;
        if (paymentId) await admin.from("payments").update({ status: "canceled" }).eq("id", paymentId).eq("status", "pending");
        break;
      }
      case "charge.refunded": {
        const pi = typeof obj.payment_intent === "string" ? obj.payment_intent : null;
        const paymentId = obj.metadata?.payment_id;
        if (paymentId) await admin.from("payments").update({ status: "refunded" }).eq("id", paymentId);
        else if (pi) await admin.from("payments").update({ status: "refunded" }).eq("stripe_payment_intent_id", pi);
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
