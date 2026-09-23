// ════════════════════════════════════════════════════════════════════════
// Edge Function · staff  (Valor Train Pro) — staff actions, plus parent self-checkout
//   POST {action:"invite_parent", athlete_id}
//        → a one-tap login link for the parent (invite for a new account, magic link
//          for an existing one). Staff show it as a QR, text it or email it. Valid 24h.
//   POST {action:"take_payment", athlete_id, plan_key}
//        → Stripe Checkout for a program (enrollment; content included) or "drop_in".
//          settings.enrollment.billing decides the model: "monthly" = recurring monthly
//          price (Stripe subscription), "one_time" = single charge. Drop-in is always one
//          time. Returns {url} for the QR / link; {configured:false} until
//          STRIPE_SECRET_KEY is set; {already_enrolled:true} if a program is already paid.
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
  const isDropIn = planKey === "drop_in";
  const program = isDropIn ? (cfg.drop_in ? { key: "drop_in", ...cfg.drop_in } : null)
    : (cfg.programs.find((p) => p.key === planKey) || (cfg.programs.length === 1 ? cfg.programs[0] : null));
  if (!program || !(program.amount_cents >= 50)) return bad("pick a program with a price");
  const monthly = !isDropIn && cfg.billing === "monthly";

  const { data: a } = await admin.from("athletes").select("*").eq("id", athleteId).maybeSingle();
  if (!a) return bad("athlete not found", 404);
  if (!isDropIn) {
    const { data: on } = await admin.rpc("athlete_enrolled", { aid: a.id });
    if (on === true) return json({ already_enrolled: true });
  }
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return json({ configured: false, message: "Card payments are not connected yet. Record cash or Venmo for now." });

  const athlete = [a.first_name, a.last_name].filter(Boolean).join(" ");
  const { data: pay, error } = await admin.from("payments").insert({
    athlete_id: a.id, parent_id: a.parent_id, plan_key: program.key, description: `${program.name} · ${athlete}`,
    amount_cents: program.amount_cents, kind: monthly ? "subscription" : "one_time", method: "card", status: "pending", recorded_by: staffId,
  }).select("*").single();
  if (error) return bad(error.message, 500);

  const stripe = new Stripe(key, { apiVersion: "2025-02-24.acacia", httpClient: Stripe.createFetchHttpClient() });
  const origin = appOrigin(req);
  const meta = { payment_id: pay.id, athlete_id: a.id, plan_key: program.key };
  try {
    const session = await stripe.checkout.sessions.create({
      mode: monthly ? "subscription" : "payment",
      customer_email: a.parent_email || undefined,
      client_reference_id: pay.id,
      line_items: [{
        quantity: 1,
        price_data: {
          currency: "usd", unit_amount: program.amount_cents,
          product_data: { name: `Valor Sports Academy: ${program.name}`, description: athlete },
          ...(monthly ? { recurring: { interval: "month" as const } } : {}),
        },
      }],
      metadata: meta,
      ...(monthly ? { subscription_data: { metadata: meta } } : { payment_intent_data: { metadata: meta } }),
      success_url: `${origin}/paid?p=${pay.id}`,
      cancel_url: `${origin}/paid?p=${pay.id}&canceled=1`,
    });
    await admin.from("payments").update({ stripe_checkout_session_id: session.id }).eq("id", pay.id);
    return json({ configured: true, url: session.url, payment_id: pay.id, billing: monthly ? "monthly" : "one_time" });
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
