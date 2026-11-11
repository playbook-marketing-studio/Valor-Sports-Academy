// Local test of the "$0 today, no invoice" autopay fix. Real database + one real UNPAID Stripe Checkout session
// (expired at the end, no card ever entered). The payment handler runs locally on port 8000 and gets signed test events.
const FN = new URL("../supabase/functions", import.meta.url).pathname;
Deno.env.set("SUPABASE_URL", Deno.env.get("VALOR_TRAINPRO_SUPABASE_URL")!); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", Deno.env.get("VALOR_TRAINPRO_SUPABASE_SERVICE_ROLE_KEY")!);
Deno.env.set("STRIPE_SECRET_KEY", Deno.env.get("VALOR_STRIPE_SECRET_KEY")!); Deno.env.set("STRIPE_WEBHOOK_SECRET", Deno.env.get("VALOR_STRIPE_WEBHOOK_SECRET")!);
const { admin, enrollmentConfig } = await import(FN + "/_shared/common.ts");
const { startSubscription } = await import(FN + "/_shared/checkout.ts");
const SK = Deno.env.get("STRIPE_SECRET_KEY")!, WH = Deno.env.get("STRIPE_WEBHOOK_SECRET")!;
const fails: string[] = [];
const check = (name: string, ok: boolean, got?: unknown) => { console.log((ok ? "ok   " : "FAIL ") + name + (ok ? "" : "  -> " + JSON.stringify(got)?.slice(0, 400))); if (!ok) fails.push(name); };
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
async function send(type: string, object: Record<string, unknown>) {
  const payload = JSON.stringify({ id: "evt_selftest_" + crypto.randomUUID().replace(/-/g, ""), object: "event", type, data: { object } });
  const t = Math.floor(Date.now() / 1000);
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(WH), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = hex(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(t + "." + payload)));
  const r = await fetch(Deno.env.get("WEBHOOK_URL") || "http://localhost:8000/", { method: "POST", headers: { "stripe-signature": "t=" + t + ",v1=" + sig, "content-type": "application/json" }, body: payload });
  return { status: r.status, body: await r.text() };
}
const stripe = async (method: string, path: string) => (await fetch("https://api.stripe.com/v1/" + path, { method, headers: { Authorization: "Bearer " + SK } })).json();
const EMAIL = "vtp-payfix@valortrainpro.test";
const sessions: string[] = [];
let uid = "";
const clean = async () => {
  const { data: kids } = await admin.from("athletes").select("id").like("first_name", "ZZPayfix%");
  for (const k of kids || []) { await admin.from("payments").delete().eq("athlete_id", k.id); await admin.from("subscriptions").delete().eq("athlete_id", k.id); await admin.from("athletes").delete().eq("id", k.id); }
  const { data: p } = await admin.from("profiles").select("id").eq("email", EMAIL);
  for (const row of p || []) await admin.auth.admin.deleteUser(row.id);
};
const LIVE = !!Deno.env.get("WEBHOOK_URL"); // test a deployed handler instead of a local one
const web = LIVE ? null : new Deno.Command("deno", { args: ["run", "--allow-net", "--allow-env", "--allow-read", "--no-check", FN + "/stripe-webhook/index.ts"], env: { ...Deno.env.toObject(), DENO_NO_PACKAGE_JSON: "1" }, stdout: "null", stderr: "piped" }).spawn();
if (LIVE) console.log("sending test events to the DEPLOYED handler");
try {
  await clean();
  for (let i = 0; i < 40 && !LIVE; i++) { try { await fetch("http://localhost:8000/"); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
  const { data: u, error: ue } = await admin.auth.admin.createUser({ email: EMAIL, password: crypto.randomUUID() + "aA1!", email_confirm: true });
  if (ue) throw ue; uid = u.user!.id;
  const mk = async (name: string) => { const { data, error } = await admin.from("athletes").insert({ first_name: name, last_name: "Selftest", parent_id: uid, parent_email: EMAIL, parent_name: "Pat Test" }).select("*").single(); if (error) throw error; return data; };
  const A = await mk("ZZPayfixA"), B = await mk("ZZPayfixB"), C = await mk("ZZPayfixC");
  const cfg = await enrollmentConfig(); const item = cfg.items.find((x: any) => x.key === "inseason_1x");
  const req = new Request("http://x", { headers: { origin: "https://preview.example" } });

  // 1. a family saves a card with nothing due today (the global setting is "none")
  const r1 = await (await startSubscription(req, null, A, item, cfg, "")).json();
  const { data: row1 } = await admin.from("subscriptions").select("*").eq("id", r1.subscription_id).single(); sessions.push(row1.stripe_checkout_session_id);
  const sess = await stripe("GET", "checkout/sessions/" + row1.stripe_checkout_session_id);
  check("Stripe made the checkout: $0 due today, first charge on the 1st", r1.configured === true && r1.first_amount_cents === 0 && r1.first_charge === "none" && sess.amount_total === 0, { r1, total: sess.amount_total });
  check("the real Stripe session carries the no-invoice tag and the first charge date", sess.metadata?.no_first_invoice === "1" && Number(sess.metadata?.first_charge_at) * 1000 === new Date(r1.next_charge_at).getTime(), sess.metadata);
  check("before the card is saved the autopay row is pending", row1.status === "pending", row1.status);

  // 2. Stripe says the checkout finished (card saved, no invoice): built from the real session object
  const done = { ...sess, status: "complete", payment_status: "no_payment_required", subscription: "sub_selftest_" + crypto.randomUUID().slice(0, 8), customer: "cus_selftest_" + crypto.randomUUID().slice(0, 8) };
  const w1 = await send("checkout.session.completed", done);
  const { data: row2 } = await admin.from("subscriptions").select("*").eq("id", row1.id).single();
  const { data: pays } = await admin.from("payments").select("*").eq("subscription_id", row1.id);
  check("handler accepts the signed event", w1.status === 200, w1);
  check("autopay is ON right away, next charge = the 1st", row2.status === "active" && row2.stripe_subscription_id === done.subscription && new Date(row2.current_period_end).getTime() === new Date(r1.next_charge_at).getTime() && row2.paid_months === 0, row2);
  check("a $0 card-saved row holds the rest of this month's classes", pays?.length === 1 && pays[0].amount_cents === 0 && pays[0].status === "paid" && pays[0].kind === "subscription" && pays[0].classes_total === row1.first_month_classes && new Date(pays[0].covers_until) > new Date(r1.next_charge_at), pays);
  const w2 = await send("checkout.session.completed", done);
  const { data: pays2 } = await admin.from("payments").select("id").eq("subscription_id", row1.id);
  check("Stripe sending it twice makes no second row", w2.status === 200 && pays2?.length === 1, pays2);
  const again = await (await startSubscription(req, null, A, item, cfg, "")).json();
  check("starting autopay again for the same kid is refused (no second Stripe subscription)", again.already_subscribed === true && !again.url, again);

  // 3. the first real charge on the 1st
  const jan1 = Math.floor(new Date(r1.next_charge_at).getTime() / 1000) + 31 * 86400;
  const w3 = await send("invoice.paid", { id: "in_selftest_" + crypto.randomUUID().slice(0, 8), object: "invoice", billing_reason: "subscription_cycle", amount_paid: item.amount_cents, total: item.amount_cents, customer: done.customer, subscription: done.subscription, payment_intent: "pi_selftest_x", lines: { data: [{ period: { end: jan1 }, metadata: { subscription_row_id: row1.id } }] } });
  const { data: row3 } = await admin.from("subscriptions").select("*").eq("id", row1.id).single();
  const { data: pays3 } = await admin.from("payments").select("*").eq("subscription_id", row1.id).order("amount_cents");
  check("the Dec 1 charge lands as a normal month: full classes, 1 paid month, still active", w3.status === 200 && pays3?.length === 2 && pays3[1].amount_cents === item.amount_cents && pays3[1].classes_total === item.classes && row3.paid_months === 1 && row3.status === "active", { w3, row3: { paid_months: row3.paid_months, status: row3.status }, pays: pays3?.map((p: any) => [p.amount_cents, p.classes_total]) });
  check("the card-saved row's leftover classes close when the new month starts", new Date(pays3![0].covers_until) <= new Date(), pays3![0].covers_until);

  // 4. a checkout that finished at Stripe but isn't active yet blocks a second one
  await admin.from("subscriptions").insert({ athlete_id: B.id, parent_id: uid, plan_key: item.key, plan_name: item.name, amount_cents: item.amount_cents, classes_per_month: item.classes, first_month: "none", status: "pending", stripe_subscription_id: "sub_selftest_block" });
  const blocked = await (await startSubscription(req, null, B, item, cfg, "")).json();
  check("a finished-but-not-yet-active checkout blocks a second autopay", blocked.already_subscribed === true && !blocked.url, blocked);

  // 5. the old trial path is untouched: an untagged checkout stays pending until its $0 invoice
  const { data: rowC } = await admin.from("subscriptions").insert({ athlete_id: C.id, parent_id: uid, plan_key: item.key, plan_name: item.name, amount_cents: item.amount_cents, classes_per_month: item.classes, first_month: "date", first_month_classes: 2, status: "pending" }).select("*").single();
  await send("checkout.session.completed", { id: "cs_selftest_trial", object: "checkout.session", mode: "subscription", status: "complete", payment_status: "no_payment_required", subscription: "sub_selftest_trial", customer: "cus_selftest_trial", client_reference_id: rowC.id, metadata: { subscription_row_id: rowC.id } });
  const { data: rowC2 } = await admin.from("subscriptions").select("status, stripe_subscription_id").eq("id", rowC.id).single();
  const { data: paysC } = await admin.from("payments").select("id").eq("subscription_id", rowC.id);
  check("untagged (trial) checkout: ids saved, still pending, no row made here", rowC2.status === "pending" && rowC2.stripe_subscription_id === "sub_selftest_trial" && !paysC?.length, { rowC2, paysC });
  await send("invoice.paid", { id: "in_selftest_trial0", object: "invoice", billing_reason: "subscription_create", amount_paid: 0, total: 0, customer: "cus_selftest_trial", subscription: "sub_selftest_trial", lines: { data: [{ period: { end: jan1 - 31 * 86400 }, metadata: { subscription_row_id: rowC.id } }] } });
  const { data: rowC3 } = await admin.from("subscriptions").select("status").eq("id", rowC.id).single();
  const { data: paysC3 } = await admin.from("payments").select("amount_cents, classes_total").eq("subscription_id", rowC.id);
  check("its $0 trial invoice still turns it on exactly as before", rowC3.status === "active" && paysC3?.length === 1 && paysC3[0].classes_total === 2, { rowC3, paysC3 });
} finally {
  for (const id of sessions) { const e = await stripe("POST", "checkout/sessions/" + id + "/expire"); console.log("Stripe session expired:", e.status, "| paid:", e.payment_status, "| amount:", e.amount_total); }
  await clean();
  const { data: left } = await admin.from("athletes").select("id").like("first_name", "ZZPayfix%"); const { data: lu } = await admin.from("profiles").select("id").eq("email", EMAIL);
  console.log("left behind: athletes", left?.length, "logins", lu?.length, fails.length ? "\nFAILED: " + fails.join(" | ") : "\nALL PASSED");
  if (web) try { web.kill(); const out = await web.output(); const err = new TextDecoder().decode(out.stderr).split("\n").filter((l) => /error|failed/i.test(l)).slice(0, 5); if (err.length) console.log("handler log:", err.join(" / ")); } catch { /* gone */ }
}
