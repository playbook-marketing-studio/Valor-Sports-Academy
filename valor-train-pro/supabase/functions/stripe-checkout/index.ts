// ════════════════════════════════════════════════════════════════════════
// Edge Function · stripe-checkout  (Valor Train Pro)
// POST {id, t}  (claim token, or the parent's JWT, or an admin JWT)
//   → creates a Stripe Checkout Session (mode=payment) for the assessment fee
//   → marks the booking payment_method=online, payment_status=pending
//   → returns {url}. Without STRIPE_SECRET_KEY it returns {configured:false}
//     so the app can fall back to "pay at the assessment".
// Secrets: STRIPE_SECRET_KEY (sk_test_… until launch), APP_URL (fallback origin).
// Deploy: supabase functions deploy stripe-checkout --no-verify-jwt --project-ref gpotwyuttkkygvxzktep
// ════════════════════════════════════════════════════════════════════════
import Stripe from "npm:stripe@17.7.0";
import { admin, appOrigin, authorizedBooking, bad, cors, json } from "../_shared/common.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return bad("POST only", 405);
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { return bad("invalid json"); }

  const key = Deno.env.get("STRIPE_SECRET_KEY");
  const id = String(body.id || ""), t = String(body.t || "");
  const { booking, reason } = await authorizedBooking(req, id, t);
  if (!booking) return bad(reason || "not allowed", 403);
  if (booking.payment_status === "paid") return json({ already_paid: true });
  if (!key) return json({ configured: false, message: "Online payment is not connected yet. You can pay at the assessment." });
  if (!booking.amount_cents || booking.amount_cents < 50) return bad("assessment fee is not set", 400);

  const stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient() });
  const origin = appOrigin(req);
  const athlete = [booking.athlete_first_name, booking.athlete_last_name].filter(Boolean).join(" ");
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: booking.parent_email,
      client_reference_id: booking.id,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: booking.currency || "usd",
          unit_amount: booking.amount_cents,
          product_data: { name: `Valor athlete assessment: ${athlete}`, description: booking.slot_start ? `Session ${booking.slot_start}` : "Time to be confirmed" },
        },
      }],
      metadata: { booking_id: booking.id },
      payment_intent_data: { metadata: { booking_id: booking.id } },
      success_url: `${origin}/book/done?b=${booking.id}&t=${booking.claim_token}&paid=1`,
      cancel_url: `${origin}/book/pay?b=${booking.id}&t=${booking.claim_token}&canceled=1`,
    });
    await admin.from("bookings").update({
      payment_method: "online", payment_status: "pending", stripe_checkout_session_id: session.id,
    }).eq("id", booking.id);
    return json({ configured: true, url: session.url, session_id: session.id });
  } catch (e) {
    console.error("stripe checkout failed", e);
    return bad(`stripe error: ${(e as Error).message}`, 502);
  }
});
