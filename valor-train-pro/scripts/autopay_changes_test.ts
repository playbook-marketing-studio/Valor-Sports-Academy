// Local test of coach plan / charge-date changes against a STAND-IN Stripe (port 8796). Real database, throwaway rows.
const FN = new URL("../supabase/functions", import.meta.url).pathname;
const U = Deno.env.get("VALOR_TRAINPRO_SUPABASE_URL")!.replace(/\/$/, ""), ANON = Deno.env.get("VALOR_TRAINPRO_SUPABASE_ANON_KEY")!;
Deno.env.set("SUPABASE_URL", U); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", Deno.env.get("VALOR_TRAINPRO_SUPABASE_SERVICE_ROLE_KEY")!);
const { admin } = await import(FN + "/_shared/common.ts");
const fails: string[] = [];
const check = (name: string, ok: boolean, got?: unknown) => { console.log((ok ? "ok   " : "FAIL ") + name + (ok ? "" : "  -> " + JSON.stringify(got)?.slice(0, 400))); if (!ok) fails.push(name); };
// ── stand-in Stripe ──
const subs: Record<string, any> = {}; const calls: { m: string; p: string; f: Record<string, string> }[] = [];
let productRefuses = false, updateRefuses = false;
const fake = Deno.serve({ port: 8796, onListen: () => {} }, async (req) => {
  const u = new URL(req.url); const f = req.method === "POST" ? Object.fromEntries(new URLSearchParams(await req.text())) : {};
  calls.push({ m: req.method, p: u.pathname, f });
  const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
  const id = u.pathname.split("/").pop()!;
  if (u.pathname.startsWith("/v1/products/")) return productRefuses ? J({ error: { message: "This key can't write products" } }, 403) : J({ id });
  if (!subs[id]) return J({ error: { message: "No such subscription" } }, 404);
  if (req.method === "POST") {
    if (updateRefuses) return J({ error: { message: "Your card was declined." } }, 402);
    if (f.trial_end) { subs[id].trial_end = Number(f.trial_end); subs[id].status = "trialing"; }
    if (f["items[0][price_data][unit_amount]"]) subs[id].items.data[0].price.unit_amount = Number(f["items[0][price_data][unit_amount]"]);
  }
  return J(subs[id]);
});
const mkStripeSub = (id: string, status = "trialing") => { subs[id] = { id, status, metadata: {}, items: { data: [{ id: "si_" + id, price: { unit_amount: 9900, product: "prod_" + id, recurring: { interval: "month" } } }] } }; };
// ── the function, run locally against the stand-in ──
const web = new Deno.Command("deno", { args: ["run", "--allow-net", "--allow-env", "--allow-read", "--no-check", FN + "/autopay-changes/index.ts"], env: { ...Deno.env.toObject(), DENO_NO_PACKAGE_JSON: "1", STRIPE_SECRET_KEY: "sk_fake", STRIPE_API_BASE: "http://localhost:8796", VALOR_GMAIL_USER: "", VALOR_GMAIL_APP_PASSWORD: "" }, stdout: "null", stderr: "piped" }).spawn();
const STAFF = "vtp-chg-staff@valortrainpro.test", PARENT = "vtp-chg-parent@valortrainpro.test";
const clean = async () => {
  const { data: kids } = await admin.from("athletes").select("id").like("first_name", "ZZChange%");
  for (const k of kids || []) { await admin.from("payments").delete().eq("athlete_id", k.id); await admin.from("subscriptions").delete().eq("athlete_id", k.id); await admin.from("athletes").delete().eq("id", k.id); }
  for (const e of [STAFF, PARENT]) { const { data: p } = await admin.from("profiles").select("id").eq("email", e); for (const r of p || []) await admin.auth.admin.deleteUser(r.id); }
};
const login = async (email: string, role?: string) => {
  const pw = crypto.randomUUID() + "aA1!";
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true }); if (error) throw error;
  if (role) await admin.from("profiles").update({ role }).eq("id", data.user!.id);
  const r = await fetch(U + "/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password: pw }) });
  return { id: data.user!.id, jwt: (await r.json()).access_token as string };
};
const call = async (jwt: string, body: unknown) => { const r = await fetch("http://localhost:8000/", { method: "POST", headers: { authorization: "Bearer " + jwt, "content-type": "application/json", origin: "https://preview.example" }, body: JSON.stringify(body) }); return { status: r.status, body: await r.json() }; };
const ymd = (days: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date(Date.now() + days * 86400000));
try {
  await clean();
  for (let i = 0; i < 40; i++) { try { await fetch("http://localhost:8000/"); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
  const staff = await login(STAFF, "admin"), parent = await login(PARENT);
  const dec1 = "2026-12-01T17:00:00.000Z";
  const mk = async (name: string, stripeId: string, extra: Record<string, unknown> = {}) => {
    const { data: a, error: e1 } = await admin.from("athletes").insert({ first_name: name, last_name: "Selftest", parent_id: parent.id, parent_email: PARENT, parent_name: "Pat Test" }).select("*").single(); if (e1) throw e1;
    const { data: s, error: e2 } = await admin.from("subscriptions").insert({ athlete_id: a.id, parent_id: parent.id, plan_key: "inseason_1x", plan_name: "In-season, 1x a week", amount_cents: 9900, classes_per_month: 4, first_month: "none", first_month_classes: 3, status: "active", stripe_subscription_id: stripeId, stripe_customer_id: "cus_fake", current_period_end: dec1, paid_months: 0, ...extra }).select("*").single(); if (e2) throw e2;
    const { data: p } = await admin.from("payments").insert({ athlete_id: a.id, parent_id: parent.id, plan_key: "inseason_1x", subscription_id: s.id, description: "ZZ card saved", amount_cents: 0, kind: "subscription", method: "card", status: "paid", paid_at: new Date().toISOString(), classes_total: 3, covers_until: "2026-12-04T17:00:00.000Z" }).select("*").single();
    mkStripeSub(stripeId); return { a, s, p };
  };
  const A = await mk("ZZChangeA", "sub_fake_a");
  const row = async (id: string) => (await admin.from("subscriptions").select("*").eq("id", id).single()).data;

  // who can
  let r = await call(parent.jwt, { action: "change_plan", subscription_id: A.s.id, plan_key: "inseason_2x" });
  check("a parent cannot change a plan", r.status === 403, r);
  r = await call(parent.jwt, { action: "change_date", subscription_id: A.s.id, date: ymd(20) });
  check("a parent cannot change a charge date", r.status === 403 && calls.length === 0, r);

  // change plan
  r = await call(staff.jwt, { action: "change_plan", subscription_id: A.s.id, plan_key: "inseason_2x" });
  const upd = calls.find((c) => c.m === "POST" && c.p === "/v1/subscriptions/sub_fake_a");
  check("coach changes the plan: accepted, no email to a .test parent", r.status === 200 && r.body.plan_name === "In-season, 2x a week" && r.body.amount_cents === 19900 && r.body.parent_emailed === false && r.body.receipt_name === true, r);
  check("Stripe is told the new price on the same line, with NO proration (nothing charged today)", upd?.f["items[0][id]"] === "si_sub_fake_a" && upd.f["items[0][price_data][unit_amount]"] === "19900" && upd.f["items[0][price_data][product]"] === "prod_sub_fake_a" && upd.f["items[0][price_data][recurring][interval]"] === "month" && upd.f.proration_behavior === "none" && !("trial_end" in upd.f), upd?.f);
  check("the receipt name is updated on that autopay's own product", calls.some((c) => c.p === "/v1/products/prod_sub_fake_a" && c.f.name === "Valor Sports Academy: In-season, 2x a week"), calls.map((c) => c.p));
  let s1 = await row(A.s.id);
  check("the app shows the new plan, same next charge date, same commitment count", s1.plan_key === "inseason_2x" && s1.amount_cents === 19900 && s1.classes_per_month === 8 && s1.current_period_end.startsWith("2026-12-01") && s1.paid_months === 0 && s1.status === "active", s1);
  const p1 = (await admin.from("payments").select("classes_total, covers_until").eq("id", A.p.id).single()).data;
  check("this month's classes are left alone", p1.classes_total === 3 && p1.covers_until.startsWith("2026-12-04"), p1);
  r = await call(staff.jwt, { action: "change_plan", subscription_id: A.s.id, plan_key: "inseason_2x" }); check("same plan again is refused", r.status === 409, r);
  r = await call(staff.jwt, { action: "change_plan", subscription_id: A.s.id, plan_key: "drop_in" }); check("a one-time item is not a plan", r.status === 400, r);
  productRefuses = true;
  r = await call(staff.jwt, { action: "change_plan", subscription_id: A.s.id, plan_key: "offseason_3x" }); productRefuses = false;
  check("if Stripe won't rename the receipt the change still goes through and says so", r.status === 200 && r.body.receipt_name === false && (await row(A.s.id)).amount_cents === 29900, r);
  updateRefuses = true;
  r = await call(staff.jwt, { action: "change_plan", subscription_id: A.s.id, plan_key: "inseason_1x" }); updateRefuses = false;
  check("if Stripe refuses the change, the app is NOT changed and the coach sees why", r.status === 502 && /Stripe said no/.test(r.body.error) && (await row(A.s.id)).amount_cents === 29900, r);

  // change date
  calls.length = 0; const d20 = ymd(27);
  r = await call(staff.jwt, { action: "change_date", subscription_id: A.s.id, date: d20 });
  const dc = calls.find((c) => c.m === "POST"); const want = new Date(d20 + "T17:00:00Z").getTime() / 1000; // 9am Pacific in winter
  check("coach moves the charge date: accepted", r.status === 200 && r.body.parent_emailed === false, r);
  check("Stripe gets the new date at 9am Pacific, no proration, price untouched", Number(dc?.f.trial_end) === want && dc?.f.proration_behavior === "none" && !Object.keys(dc.f).some((k) => k.startsWith("items")), dc?.f);
  s1 = await row(A.s.id);
  check("the app shows the new next charge", new Date(s1.current_period_end).getTime() / 1000 === want && s1.amount_cents === 29900, s1.current_period_end);
  let p2 = (await admin.from("payments").select("covers_until").eq("id", A.p.id).single()).data;
  check("classes stay usable until the new date (plus the 3 grace days)", new Date(p2.covers_until).getTime() / 1000 === want + 3 * 86400, p2);
  r = await call(staff.jwt, { action: "change_date", subscription_id: A.s.id, date: ymd(6) });
  p2 = (await admin.from("payments").select("covers_until").eq("id", A.p.id).single()).data;
  check("moving the date earlier never shortens classes already given", r.status === 200 && new Date(p2.covers_until).getTime() / 1000 === want + 3 * 86400, p2);
  r = await call(staff.jwt, { action: "change_date", subscription_id: A.s.id, date: ymd(6) }); check("the same date again is refused", r.status === 409, r);
  r = await call(staff.jwt, { action: "change_date", subscription_id: A.s.id, date: ymd(1) }); check("tomorrow is too soon", r.status === 400, r);
  r = await call(staff.jwt, { action: "change_date", subscription_id: A.s.id, date: ymd(90) }); check("3 months out is too far", r.status === 400, r);
  r = await call(staff.jwt, { action: "change_date", subscription_id: A.s.id, date: "2026-02-31" }); check("a date that doesn't exist is refused", r.status === 400, r);

  // autopays that can't be changed
  const B = await mk("ZZChangeB", "sub_fake_b", { status: "past_due" }); r = await call(staff.jwt, { action: "change_plan", subscription_id: B.s.id, plan_key: "inseason_2x" }); check("past due: fix the card first", r.status === 409, r);
  const C = await mk("ZZChangeC", "sub_fake_c", { cancel_at_period_end: true }); r = await call(staff.jwt, { action: "change_date", subscription_id: C.s.id, date: ymd(20) }); check("set to end: keep autopay on first", r.status === 409, r);
  const D = await mk("ZZChangeD", "sub_fake_d"); subs["sub_fake_d"].status = "canceled"; r = await call(staff.jwt, { action: "change_plan", subscription_id: D.s.id, plan_key: "inseason_2x" }); check("canceled in Stripe: refused, app untouched", r.status === 409 && (await row(D.s.id)).plan_key === "inseason_1x", r);
  r = await call(staff.jwt, { action: "change_plan", subscription_id: crypto.randomUUID(), plan_key: "inseason_2x" }); check("unknown autopay", r.status === 404, r);
} finally {
  await clean();
  const { data: left } = await admin.from("athletes").select("id").like("first_name", "ZZChange%"); const { data: lu } = await admin.from("profiles").select("id").like("email", "vtp-chg-%");
  console.log("left behind: athletes", left?.length, "logins", lu?.length, fails.length ? "\nFAILED: " + fails.join(" | ") : "\nALL PASSED");
  try { web.kill(); await web.output(); } catch { /* gone */ }
  await fake.shutdown();
}
