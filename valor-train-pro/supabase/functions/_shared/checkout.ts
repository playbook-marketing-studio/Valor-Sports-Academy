// Card checkout (one-time Stripe Checkout, or a monthly autopay subscription), shared by fn staff
// (staff + parents on file) and fn family (families who signed up in the app). Moved out of staff 11/10/2026.
import Stripe from "npm:stripe@17.7.0";
import { admin, appOrigin, bad, enrollmentConfig, json } from "./common.ts";
import { CHARGE_HOUR, firstMonthClasses, fmtDayPT, isMonthly, monthlySettings, nextAnchor, ptToUtc } from "./billing.ts";

export const stripeClient = () => new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-02-24.acacia", httpClient: Stripe.createFetchHttpClient() });

export async function takePayment(req: Request, staffId: string | null, athleteId: string, planKey: string, testMonthly = false, firstCharge = "") {
  const cfg = await enrollmentConfig();
  const item = cfg.items.find((x) => x.key === planKey);
  // a $0 MONTHLY plan is allowed (the TEST plan): the card still goes on file, Stripe bills $0 on the 1st
  if (!item || !(item.amount_cents >= 50 || (isMonthly(item as any) && item.amount_cents === 0))) return bad("pick a class or pack with a price");
  const { data: a } = await admin.from("athletes").select("*").eq("id", athleteId).maybeSingle();
  if (!a) return bad("athlete not found", 404);
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) return json({ configured: false, message: "Card payments are not connected yet. Record cash or Venmo for now." });
  // test_monthly: staff only, Live example athlete only: run a one-time item through autopay checkout (testing before monthly plans go live)
  if (isMonthly(item as any) || (testMonthly && staffId && a.is_example)) return await startSubscription(req, staffId, a, item, cfg, firstCharge);

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

/** Monthly plan: Stripe Checkout in subscription mode, anchored to the 1st (9am Pacific). */
/** first_charge (staff only): "" = the global first-month setting; "now" = full month today; "first" = card saved today (no charge), full plan
 *  on the 1st; "YYYY-MM-DD" = card saved today (no charge), full plan on that date and the same day every month after (a family whose old
 *  billing runs to a mid-month date). */
export async function startSubscription(req: Request, staffId: string | null, a: Record<string, any>, item: Record<string, any>, cfg: any, firstCharge = "") {
  const { data: live } = await admin.from("subscriptions").select("id, status").eq("athlete_id", a.id).in("status", ["active", "past_due"]).limit(1);
  if (live?.length) return json({ already_subscribed: true, subscription_id: live[0].id });
  const rules = monthlySettings(cfg);
  const now = new Date();
  const anchor = nextAnchor(now);
  let firstClasses = firstMonthClasses(item.classes ?? null, now, anchor);
  const athlete = [a.first_name, a.last_name].filter(Boolean).join(" ");
  // Stripe needs a trial to end 48h+ out; in the last 2 days of a month the trial modes fall back to prorated
  const trialOk = !!anchor && anchor.getTime() - now.getTime() > 49 * 3600000;
  let firstMode: "prorate" | "half" | "none" | "full" | "date" = trialOk && rules.first_month !== "prorate" ? rules.first_month : "prorate";
  let trialEnd: Date | null = anchor; // when the first full payment lands for the trial modes
  if (firstCharge === "now") { firstMode = trialOk ? "full" : "prorate"; firstClasses = item.classes ?? null; }
  else if (firstCharge === "first") { firstMode = trialOk ? "none" : "prorate"; }
  else if (firstCharge === "prorate") { firstMode = "prorate"; } // fn family: a family new to Valor pays the rest of this month today
  else if (/^\d{4}-\d{2}-\d{2}$/.test(firstCharge)) {
    const [y, m, d] = firstCharge.split("-").map(Number);
    const when = ptToUtc(y, m, d, CHARGE_HOUR);
    if (Number.isNaN(when.getTime())) return bad("that date doesn't look right");
    if (when.getTime() - now.getTime() < 49 * 3600000) return bad("pick a date at least 2 days out, or choose Today");
    if (when.getTime() - now.getTime() > 70 * 86400000) return bad("pick a date within the next 2 months");
    firstMode = "date"; trialEnd = when; firstClasses = item.classes ?? null;
  }
  const { data: sub, error } = await admin.from("subscriptions").insert({
    athlete_id: a.id, parent_id: a.parent_id, plan_key: item.key, plan_name: item.name, amount_cents: item.amount_cents,
    classes_per_month: item.classes ?? null, first_month: firstMode,
    first_month_classes: firstClasses, created_by: staffId,
  }).select("*").single();
  if (error) return bad(error.message, 500);

  const meta: Record<string, string> = { subscription_row_id: sub.id, athlete_id: a.id, plan_key: item.key, first_month_classes: String(firstClasses ?? "") };
  const product_data = { name: `Valor Sports Academy: ${item.name}`, description: `${athlete} · monthly, charged on the 1st` };
  const line_items: any[] = [{ quantity: 1, price_data: { currency: "usd", unit_amount: item.amount_cents, recurring: { interval: "month" }, product_data } }];
  const subscription_data: Record<string, unknown> = { metadata: meta, description: `${item.name} · ${athlete}` };
  let customText: Record<string, unknown> | undefined;
  if (trialEnd && (firstMode === "none" || firstMode === "date")) {
    // nothing charged today (the family already paid elsewhere until then): Checkout saves the card and the days until the
    // first full payment are a Stripe trial. "none" lands on the 1st, "date" on the chosen day and renews on that day of the
    // month. The trial's $0 invoice (billing_reason subscription_create) still fires invoice.paid, which unlocks the app.
    // An optional card-check charge (settings first_fee_cents > 0) is still supported.
    subscription_data.trial_end = Math.floor(trialEnd.getTime() / 1000);
    if (rules.first_fee_cents > 0) {
      line_items.push({ quantity: 1, price_data: { currency: "usd", unit_amount: rules.first_fee_cents, product_data: { name: `Card on file (first full payment ${fmtDayPT(trialEnd)})`, description: athlete } } });
    } else {
      customText = { submit: { message: `Nothing is charged today. Your card is saved for autopay, and your first payment of $${(item.amount_cents / 100).toFixed(2)} is on ${fmtDayPT(trialEnd)}.` } };
    }
  } else if (anchor && firstMode === "full") {
    // full month today (one-time line), the recurring plan starts on the 1st
    subscription_data.trial_end = Math.floor(anchor.getTime() / 1000);
    line_items.push({ quantity: 1, price_data: { currency: "usd", unit_amount: item.amount_cents, product_data: { name: `Rest of this month (through ${fmtDayPT(new Date(anchor.getTime() - 86400000))})`, description: athlete } } });
  } else if (anchor && firstMode === "half") {
    // flat half price today (one-time line), recurring billing starts on the 1st. Checkout can't mix
    // proration "none" with one-time prices, so the days until the 1st are a Stripe trial.
    subscription_data.trial_end = Math.floor(anchor.getTime() / 1000);
    line_items.push({ quantity: 1, price_data: { currency: "usd", unit_amount: Math.round(item.amount_cents / 2), product_data: { name: `Rest of this month (half price, through ${fmtDayPT(new Date(anchor.getTime() - 86400000))})`, description: athlete } } });
  } else if (anchor) {
    subscription_data.billing_cycle_anchor = Math.floor(anchor.getTime() / 1000);
    subscription_data.proration_behavior = "create_prorations"; // Stripe charges the exact days left in the month
  }
  const origin = appOrigin(req);
  try {
    const session = await stripeClient().checkout.sessions.create({
      mode: "subscription",
      customer_email: a.parent_email || undefined,
      client_reference_id: sub.id,
      line_items,
      subscription_data: subscription_data as any,
      ...(customText ? { custom_text: customText as any } : {}),
      metadata: meta,
      success_url: `${origin}/paid?s=${sub.id}`,
      cancel_url: `${origin}/paid?s=${sub.id}&canceled=1`,
    });
    await admin.from("subscriptions").update({ stripe_checkout_session_id: session.id }).eq("id", sub.id);
    return json({ configured: true, url: session.url, subscription_id: sub.id, first_amount_cents: session.amount_total, next_charge_at: (firstMode === "date" ? trialEnd : anchor)?.toISOString() || null, first_charge: firstMode, first_month_classes: firstClasses });
  } catch (e) {
    await admin.from("subscriptions").update({ status: "expired" }).eq("id", sub.id);
    return bad(`Stripe error: ${(e as Error).message}`, 502);
  }
}

