// ════════════════════════════════════════════════════════════════════════
// Edge Function · staff  (Valor Train Pro) — staff actions, plus parent self-checkout
//   POST {action:"invite_parent", athlete_id}
//        → a one-tap login link for the parent (invite for a new account, magic link
//          for an existing one). Staff show it as a QR, text it or email it. Valid 24h.
//   POST {action:"email_parent_login", athlete_id}
//        → the app emails the login itself (Valor-branded, from Valor's Gmail). Off until AUTH_EMAIL_ENABLED=true.
//        style:"switch" (10/21/2026, the move off UpperHand): "Valor moved to a new app" email from Valor's
//        Gmail with a Set my password button, plus "tap Start autopay on <kid>'s card" when the kid has no
//        autopay yet. Same one-time 24h link. Stamps athletes.login_emailed_at for the rollout tracker.
//   POST {action:"take_payment", athlete_id, plan_key}
//        → one-time Stripe Checkout for a class or class pack (settings.enrollment.items).
//          No subscriptions. A paid class/pack unlocks content until its classes are used
//          or it expires. Returns {url} for the QR / link; {configured:false} until
//          STRIPE_SECRET_KEY is set; cash / Venmo are recorded straight from the app.
//        A PARENT may call take_payment for their own athlete (pay later from their phone);
//        everything else is staff only.
//   Monthly plans (item.billing = "monthly", Corey 10/19/2026): take_payment starts a Stripe
//   subscription instead: charged on the 1st, first month reduced (see _shared/billing.ts).
//   POST {action:"billing_portal", subscription_id}  → Stripe page to update the card / see invoices
//   POST {action:"cancel_autopay", subscription_id}  → stops at the end of the paid month. Parents only
//        after the commitment (3 paid months); coaches any time.
//   POST {action:"resume_autopay", subscription_id}  → undo a pending cancel
// Deploy: supabase functions deploy staff --no-verify-jwt --project-ref gpotwyuttkkygvxzktep --use-api
// ════════════════════════════════════════════════════════════════════════
import Stripe from "npm:stripe@17.7.0";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import { admin, appOrigin, bad, cors, enrollmentConfig, json, userFromRequest } from "../_shared/common.ts";
import { CHARGE_HOUR, firstMonthClasses, fmtDayPT, isMonthly, monthlySettings, nextAnchor, ptToUtc } from "../_shared/billing.ts";
import { btn, esc, mailConfigured, sendMail, wrapHtml } from "../_shared/mail.ts";

/**
 * The parent login this athlete should use, resolved safely (security audit 9/30).
 * athletes.parent_email can come from the public booking form, so an email match alone
 * never gets anyone a login link:
 *  - an email that belongs to a staff login is refused;
 *  - an existing account not yet linked to this athlete is linked only when its email is
 *    vouched for (staff invited it, or it confirmed a sign-up email), and then no QR/text link
 *    is issued: they sign in as usual or get the login emailed to their own inbox.
 */
async function resolveParent(a: Record<string, any>) {
  let email = (a.parent_email || "").toLowerCase();
  if (a.parent_id) {
    const { data } = await admin.auth.admin.getUserById(a.parent_id);
    email = (data?.user?.email || email).toLowerCase();
  }
  if (!email) return { error: bad("add the parent's email first") };
  const { data: prof } = await admin.from("profiles").select("id, role").eq("email", email).maybeSingle();
  if (!prof) return { email, prof: null, linked: false };
  if (prof.role !== "parent") return { error: bad("That email belongs to a staff login. Use the parent's own email.", 409) };
  if (a.parent_id === prof.id) return { email, prof, linked: true };
  const { data: u } = await admin.auth.admin.getUserById(prof.id);
  const vouched = !!u?.user && (!!u.user.invited_at || (!!u.user.confirmation_sent_at && !!u.user.email_confirmed_at));
  if (!vouched) {
    return { error: bad("An account with this email was made through open sign-up, so the app can't tell it belongs to this parent. Ask Omar to check it before linking.", 409) };
  }
  await admin.from("athletes").update({ parent_id: prof.id }).eq("id", a.id).is("parent_id", null);
  return { email, prof, linked: false, justLinked: true };
}

async function inviteParent(req: Request, athleteId: string) {
  const { data: a } = await admin.from("athletes").select("*").eq("id", athleteId).maybeSingle();
  if (!a) return bad("athlete not found", 404);
  const r = await resolveParent(a);
  if (r.error) return r.error;
  const { email, prof } = r;
  const redirectTo = `${appOrigin(req)}/welcome`;

  let link: string | undefined;
  if (prof && r.justLinked) {
    await admin.from("athletes").update({ invited_at: new Date().toISOString() }).eq("id", a.id);
    return json({
      link: null, email, existing_account: true, linked: true,
      message: `${email} already has a Valor login, so ${a.first_name} is now on that account. They sign in with their password, or tap "Email it to them".`,
    });
  }
  if (prof) {
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo } });
    if (error) return bad(error.message, 500);
    link = data.properties?.action_link;
  } else {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite", email,
      options: { redirectTo, data: { full_name: a.parent_name, phone: a.parent_phone, role: "parent", athlete_first_name: a.first_name } },
    });
    if (error) return bad(error.message, 500);
    link = data.properties?.action_link;
    // link this athlete (the database no longer links by email; see the 9/30 security migration)
    if (data.user?.id) await admin.from("athletes").update({ parent_id: data.user.id }).eq("id", a.id).is("parent_id", null);
  }
  await admin.from("athletes").update({ invited_at: new Date().toISOString() }).eq("id", a.id);
  return json({ link, email, existing_account: !!prof, expires_hours: 24 });
}

/**
 * Email the parent their login (Valor-branded templates, sent from Valor's Gmail via Supabase Auth SMTP).
 * New parent: invite email (creates the account). Existing parent: one-tap login email.
 * Off until AUTH_EMAIL_ENABLED=true (set by scripts/enable_login_emails.sh once SMTP is connected).
 */
/** The move-to-the-new-app login email (style "switch"): our own Valor-branded email with the one-time link. */
async function emailSwitchLogin(req: Request, a: Record<string, any>, email: string, prof: Record<string, any> | null) {
  if (!mailConfigured()) return bad("Valor's Gmail isn't connected, so the login can't be emailed", 503);
  const redirectTo = `${(Deno.env.get("APP_URL") || appOrigin(req)).replace(/\/$/, "")}/welcome`;
  let link: string | undefined;
  if (!prof) {
    const { data, error } = await admin.auth.admin.generateLink({
      type: "invite", email,
      options: { redirectTo, data: { full_name: a.parent_name, phone: a.parent_phone, role: "parent", athlete_first_name: a.first_name } },
    });
    if (error) return bad(error.message, 502);
    link = data.properties?.action_link;
    if (data.user?.id) await admin.from("athletes").update({ parent_id: data.user.id }).eq("id", a.id).is("parent_id", null);
  } else {
    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email, options: { redirectTo } });
    if (error) return bad(error.message, 502);
    link = data.properties?.action_link;
  }
  if (!link) return bad("could not make the login link", 500);
  const cfg = await enrollmentConfig();
  const { data: live } = await admin.from("subscriptions").select("id").eq("athlete_id", a.id).in("status", ["active", "past_due"]).limit(1);
  const askAutopay = !live?.length && cfg.items.some((x) => isMonthly(x as any));
  const hi = String(a.parent_name || "").trim().split(/\s+/)[0];
  const kid = a.first_name || "your athlete";
  const subject = "Your Valor app login";
  const autopayHtml = askAutopay
    ? `<p>Once you're in, tap <strong>Start autopay</strong> on ${esc(kid)}'s card to set up your monthly plan. Your card is charged on the 1st of each month, and your first month is prorated.</p>`
    : `<p>Once you're in, you'll see ${esc(kid)}'s workouts and messages from the coaches.</p>`;
  await sendMail({
    to: email, subject,
    text: `${hi ? `Hi ${hi}, ` : ""}Valor has moved to a new app. Your workouts, messages with the coaches and payments are all in one place now. Set your password: ${link} ${askAutopay ? `Once you're in, tap Start autopay on ${kid}'s card to set up your monthly plan. Your card is charged on the 1st of each month, and your first month is prorated. ` : ""}Questions? Message us in the app or text 509-987-4612.`,
    html: wrapHtml(subject,
      `<p>${hi ? `Hi ${esc(hi)}, ` : ""}Valor has moved to a new app. Your workouts, messages with the coaches and payments are all in one place now.</p>
       ${btn(link, "Set my password")}
       ${autopayHtml}
       <p>Questions? Message us in the app or text <a href="sms:+15099874612" style="color:#c8102e">509-987-4612</a>.</p>
       <p style="font-size:13px;color:#6b665c">Button not working? Copy this link into your browser:<br><span style="word-break:break-all">${esc(link)}</span></p>`,
      "The link works once, for 24 hours. If it expires, ask a coach to send a new one."),
  });
  const now = new Date().toISOString();
  await admin.from("athletes").update({ invited_at: now, login_emailed_at: now }).eq("id", a.id);
  return json({ sent: true, email, existing_account: !!prof, style: "switch", asked_autopay: askAutopay });
}

async function emailParentLogin(req: Request, athleteId: string, style = "") {
  if (style === "switch") {
    const { data: a } = await admin.from("athletes").select("*").eq("id", athleteId).maybeSingle();
    if (!a) return bad("athlete not found", 404);
    const r = await resolveParent(a);
    if (r.error) return r.error;
    return await emailSwitchLogin(req, a, r.email!, r.prof);
  }
  if (Deno.env.get("AUTH_EMAIL_ENABLED") !== "true") {
    return json({ configured: false, message: "Login emails switch on once Valor's Gmail is connected. Use the QR code or Text for now." });
  }
  const { data: a } = await admin.from("athletes").select("*").eq("id", athleteId).maybeSingle();
  if (!a) return bad("athlete not found", 404);
  const r = await resolveParent(a);
  if (r.error) return r.error;
  const { email, prof } = r;
  const redirectTo = `${appOrigin(req)}/welcome`;
  if (!prof) {
    const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo, data: { full_name: a.parent_name, phone: a.parent_phone, role: "parent", athlete_first_name: a.first_name },
    });
    if (error) return bad(error.message, 502);
    if (data.user?.id) await admin.from("athletes").update({ parent_id: data.user.id }).eq("id", a.id).is("parent_id", null);
  } else {
    const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { auth: { persistSession: false } });
    const { error } = await anon.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo, shouldCreateUser: false } });
    if (error) return bad(error.message, 502);
  }
  await admin.from("athletes").update({ invited_at: new Date().toISOString() }).eq("id", a.id);
  return json({ sent: true, email, existing_account: !!prof });
}

const stripeClient = () => new Stripe(Deno.env.get("STRIPE_SECRET_KEY")!, { apiVersion: "2025-02-24.acacia", httpClient: Stripe.createFetchHttpClient() });

async function takePayment(req: Request, staffId: string | null, athleteId: string, planKey: string, testMonthly = false, firstCharge = "") {
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
/** first_charge (staff only): "" = the global first-month setting; "now" = full month today; "first" = card check today, full plan
 *  on the 1st; "YYYY-MM-DD" = card check today, full plan on that date and the same day every month after (a family whose old
 *  billing runs to a mid-month date). */
async function startSubscription(req: Request, staffId: string | null, a: Record<string, any>, item: Record<string, any>, cfg: any, firstCharge = "") {
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
  if (trialEnd && (firstMode === "none" || firstMode === "date")) {
    // card check only today (50 cents by default, Stripe's minimum; the family already paid elsewhere until then),
    // the days until the first full payment are a Stripe trial. "none" lands on the 1st, "date" on the chosen day and
    // renews on that day of the month. The 50 cent invoice still unlocks the app until then.
    subscription_data.trial_end = Math.floor(trialEnd.getTime() / 1000);
    line_items.push({ quantity: 1, price_data: { currency: "usd", unit_amount: rules.first_fee_cents, product_data: { name: `Card on file (first full payment ${fmtDayPT(trialEnd)})`, description: athlete } } });
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

/** The subscription row, if the caller is staff or that athlete's parent. */
async function subForCaller(userId: string, isStaff: boolean, subId: string) {
  const { data: sub } = await admin.from("subscriptions").select("*").eq("id", subId).maybeSingle();
  if (!sub) return { error: bad("autopay not found", 404) };
  if (!isStaff) {
    const { data: a } = await admin.from("athletes").select("parent_id").eq("id", sub.athlete_id).maybeSingle();
    if (!a || a.parent_id !== userId) return { error: bad("not your athlete", 403) };
  }
  return { sub };
}

/** One Stripe portal configuration for Valor: update card + invoices only (cancel goes through the app, for the commitment). */
async function portalConfigId(stripe: Stripe) {
  const list = await stripe.billingPortal.configurations.list({ limit: 10, active: true });
  const mine = list.data.find((c) => c.metadata?.app === "valor-train-pro");
  if (mine) return mine.id;
  const c = await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Valor Sports Academy: update your card or see receipts" },
    features: {
      payment_method_update: { enabled: true },
      invoice_history: { enabled: true },
      customer_update: { enabled: true, allowed_updates: ["email"] },
      subscription_cancel: { enabled: false },
      subscription_update: { enabled: false },
    },
    metadata: { app: "valor-train-pro" },
  } as any);
  return c.id;
}

async function billingPortal(req: Request, sub: Record<string, any>) {
  if (!sub.stripe_customer_id) return bad("This autopay isn't connected to Stripe yet", 409);
  const stripe = stripeClient();
  const s = await stripe.billingPortal.sessions.create({ customer: sub.stripe_customer_id, configuration: await portalConfigId(stripe), return_url: `${appOrigin(req)}/` });
  return json({ url: s.url });
}

async function setCancel(userId: string, isStaff: boolean, sub: Record<string, any>, cancel: boolean) {
  if (!sub.stripe_subscription_id || !["active", "past_due"].includes(sub.status)) return bad("No active autopay to change", 409);
  if (cancel && !isStaff) {
    const rules = monthlySettings(await enrollmentConfig() as any);
    if (sub.paid_months < rules.commitment_months) {
      const left = rules.commitment_months - sub.paid_months;
      return bad(`Autopay has a ${rules.commitment_months}-month commitment. You can cancel after ${left} more payment${left === 1 ? "" : "s"}. Questions? Call or text 509-987-4612.`, 409);
    }
  }
  const updated = await stripeClient().subscriptions.update(sub.stripe_subscription_id, { cancel_at_period_end: cancel });
  await admin.from("subscriptions").update({ cancel_at_period_end: updated.cancel_at_period_end, cancel_requested_by: cancel ? userId : null, updated_at: new Date().toISOString() }).eq("id", sub.id);
  return json({ ok: true, cancel_at_period_end: updated.cancel_at_period_end });
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
      return await takePayment(req, isStaff ? user.id : null, athleteId, String(body.plan_key || ""), isStaff && body.test_monthly === true, isStaff ? String(body.first_charge || "") : "");
    }
    if (body.action === "billing_portal" || body.action === "cancel_autopay" || body.action === "resume_autopay") {
      if (!Deno.env.get("STRIPE_SECRET_KEY")) return json({ configured: false });
      const r = await subForCaller(user.id, isStaff, String(body.subscription_id || ""));
      if (r.error) return r.error;
      if (body.action === "billing_portal") return await billingPortal(req, r.sub);
      return await setCancel(user.id, isStaff, r.sub, body.action === "cancel_autopay");
    }
    if (!isStaff) return bad("staff only", 403);
    if (body.action === "invite_parent") return await inviteParent(req, athleteId);
    if (body.action === "email_parent_login") return await emailParentLogin(req, athleteId, String(body.style || ""));
    return bad("unknown action", 404);
  } catch (e) {
    console.error(e);
    return bad("server error", 500);
  }
});
