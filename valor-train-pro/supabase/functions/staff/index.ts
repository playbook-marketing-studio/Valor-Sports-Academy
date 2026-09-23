// ════════════════════════════════════════════════════════════════════════
// Edge Function · staff  (Valor Train Pro) — staff actions, plus parent self-checkout
//   POST {action:"invite_parent", athlete_id}
//        → a one-tap login link for the parent (invite for a new account, magic link
//          for an existing one). Staff show it as a QR, text it or email it. Valid 24h.
//   POST {action:"take_payment", athlete_id, plan_key}
//        → one-time Stripe Checkout for a class or class pack (settings.enrollment.items).
//          No subscriptions. A paid class/pack unlocks content until its classes are used
//          or it expires. Returns {url} for the QR / link; {configured:false} until
//          STRIPE_SECRET_KEY is set; cash / Venmo are recorded straight from the app.
//        A PARENT may call take_payment for their own athlete (pay later from their phone);
//        everything else is staff only.
// Deploy: supabase functions deploy staff --no-verify-jwt --project-ref gpotwyuttkkygvxzktep --use-api
// ════════════════════════════════════════════════════════════════════════
import Stripe from "npm:stripe@17.7.0";
import { admin, appOrigin, bad, cors, enrollmentConfig, json, userFromRequest } from "../_shared/common.ts";

async function inviteParent(req: Request, athleteId: string) {
  const { data: a } = await admin.from("athletes").select("*").eq("id", athleteId).maybeSingle();
  if (!a) return bad("athlete not found", 404);
  let email = (a.parent_email || "").toLowerCase();
  if (a.parent_id) {
    const { data: p } = await admin.from("profiles").select("email").eq("id", a.parent_id).maybeSingle();
    email = (p?.email || email).toLowerCase();
  }
  if (!email) return bad("add the parent's email first");
  const redirectTo = `${appOrigin(req)}/welcome`;

  // existing account? (they booked before, or staff invited them for a sibling)
  const { data: prof } = await admin.from("profiles").select("id, role").ilike("email", email).maybeSingle();
  let link: string | undefined;
  if (prof) {
    if (!a.parent_id && prof.role === "parent") await admin.from("athletes").update({ parent_id: prof.id }).eq("id", a.id);
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo } });
    if (error) return bad(error.message, 500);
    link = data.properties?.action_link;
  } else {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite", email,
      options: { redirectTo, data: { full_name: a.parent_name, phone: a.parent_phone, role: "parent" } },
    });
    if (error) return bad(error.message, 500);
    link = data.properties?.action_link;
    // the new-user trigger links athletes by email; make sure this one is linked
    if (data.user?.id) await admin.from("athletes").update({ parent_id: data.user.id }).eq("id", a.id).is("parent_id", null);
  }
  await admin.from("athletes").update({ invited_at: new Date().toISOString() }).eq("id", a.id);
  return json({ link, email, existing_account: !!prof, expires_hours: 24 });
}

async function takePayment(req: Request, staffId: string | null, athleteId: string, planKey: string) {
  const cfg = await enrollmentConfig();
  const item = cfg.items.find((x) => x.key === planKey);
  if (!item || !(item.amount_cents >= 50)) return bad("pick a class or pack with a price");
  const { data: a } = await admin.from("athletes").select("*").eq("id", athleteId).maybeSingle();
  if (!a) return bad("athlete not found", 404);
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return json({ configured: false, message: "Card payments are not connected yet. Record cash or Venmo for now." });

  const athlete = [a.first_name, a.last_name].filter(Boolean).join(" ");
  const { data: pay, error } = await admin.from("payments").insert({
    athlete_id: a.id, parent_id: a.parent_id, plan_key: item.key, description: `${item.name} · ${athlete}`,
    amount_cents: item.amount_cents, kind: "one_time", method: "card", status: "pending", recorded_by: staffId,
    classes_total: item.classes ?? null,
  }).select("*").single();
  if (error) return bad(error.message, 500);

  const stripe = new Stripe(key, { apiVersion: "2025-02-24.acacia", httpClient: Stripe.createFetchHttpClient() });
  const origin = appOrigin(req);
  const meta = { payment_id: pay.id, athlete_id: a.id, plan_key: item.key, expires_days: String(item.expires_days ?? "") };
  try {
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: a.parent_email || undefined,
      client_reference_id: pay.id,
      line_items: [{ quantity: 1, price_data: { currency: "usd", unit_amount: item.amount_cents, product_data: { name: `Valor Sports Academy: ${item.name}`, description: athlete } } }],
      metadata: meta,
      payment_intent_data: { metadata: meta },
      success_url: `${origin}/paid?p=${pay.id}`,
      cancel_url: `${origin}/paid?p=${pay.id}&canceled=1`,
    });
    await admin.from("payments").update({ stripe_checkout_session_id: session.id }).eq("id", pay.id);
    return json({ configured: true, url: session.url, payment_id: pay.id });
  } catch (e) {
    await admin.from("payments").update({ status: "canceled", note: `Stripe error: ${(e as Error).message}`.slice(0, 300) }).eq("id", pay.id);
    return bad(`Stripe error: ${(e as Error).message}`, 502);
  }
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
    const athleteId = String(body.athlete_id || "");
    if (body.action === "take_payment") {
      if (!isStaff) {
        const { data: a } = await admin.from("athletes").select("parent_id").eq("id", athleteId).maybeSingle();
        if (!a || a.parent_id !== user.id) return bad("not your athlete", 403);
      }
      return await takePayment(req, isStaff ? user.id : null, athleteId, String(body.plan_key || ""));
    }
    if (!isStaff) return bad("staff only", 403);
    if (body.action === "invite_parent") return await inviteParent(req, athleteId);
    return bad("unknown action", 404);
  } catch (e) {
    console.error(e);
    return bad("server error", 500);
  }
});
