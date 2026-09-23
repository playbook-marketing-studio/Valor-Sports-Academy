// ════════════════════════════════════════════════════════════════════════
// Edge Function · stripe-webhook  (Valor Train Pro)
// Stripe → POST here. Verifies the signature with STRIPE_WEBHOOK_SECRET, then:
//   checkout.session.completed / checkout.session.async_payment_succeeded (paid)
//     → bookings.payment_status = paid, paid_at, stripe ids
//   checkout.session.async_payment_failed / checkout.session.expired
//     → bookings.payment_status = unpaid (parent can retry or pay in person)
//   charge.refunded → refunded
// Idempotent: re-delivery of a paid event is a no-op.
// Stripe dashboard → Developers → Webhooks → endpoint URL:
//   https://gpotwyuttkkygvxzktep.supabase.co/functions/v1/stripe-webhook
// Deploy: supabase functions deploy stripe-webhook --no-verify-jwt --project-ref gpotwyuttkkygvxzktep
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
    apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient(),
  });
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, secret, undefined, cryptoProvider);
  } catch (e) {
    console.error("bad signature", (e as Error).message);
    return bad("bad signature", 400);
  }

  const obj = event.data.object as Record<string, unknown>;
  const meta = (obj.metadata || {}) as Record<string, string>;
  const bookingId = meta.booking_id || (obj.client_reference_id as string | undefined);

  const findBooking = async () => {
    if (bookingId) {
      const { data } = await admin.from("bookings").select("*").eq("id", bookingId).maybeSingle();
      if (data) return data;
    }
    if (typeof obj.id === "string" && event.type.startsWith("checkout.session")) {
      const { data } = await admin.from("bookings").select("*").eq("stripe_checkout_session_id", obj.id).maybeSingle();
      if (data) return data;
    }
    if (typeof obj.payment_intent === "string") {
      const { data } = await admin.from("bookings").select("*").eq("stripe_payment_intent_id", obj.payment_intent).maybeSingle();
      if (data) return data;
    }
    return null;
  };

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = obj as unknown as Stripe.Checkout.Session;
        const paidNow = event.type === "checkout.session.async_payment_succeeded" || session.payment_status === "paid";
        const b = await findBooking();
        if (!b) { console.warn("no booking for", event.id); break; }
        const patch: Record<string, unknown> = {
          payment_method: "online",
          stripe_checkout_session_id: session.id,
          stripe_payment_intent_id: typeof session.payment_intent === "string" ? session.payment_intent : b.stripe_payment_intent_id,
        };
        if (paidNow && b.payment_status !== "paid") { patch.payment_status = "paid"; patch.paid_at = new Date().toISOString(); }
        else if (!paidNow && b.payment_status !== "paid") patch.payment_status = "pending";
        await admin.from("bookings").update(patch).eq("id", b.id);
        break;
      }
      case "checkout.session.async_payment_failed":
      case "checkout.session.expired": {
        const b = await findBooking();
        if (b && b.payment_status !== "paid") await admin.from("bookings").update({ payment_status: "unpaid" }).eq("id", b.id);
        break;
      }
      case "charge.refunded": {
        const b = await findBooking();
        if (b) await admin.from("bookings").update({ payment_status: "refunded" }).eq("id", b.id);
        break;
      }
      default:
        // ignore everything else
    }
  } catch (e) {
    console.error("webhook handling failed", e);
    return bad("handler error", 500);
  }
  return new Response(JSON.stringify({ received: true }), { headers: { "content-type": "application/json" } });
});
