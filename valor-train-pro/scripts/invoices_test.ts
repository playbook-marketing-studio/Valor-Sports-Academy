// Local test of fn invoices against a STAND-IN Stripe (port 8797). Real database, throwaway rows, cleans up.
// Run: set -a; source ~/Documents/Claude/Projects/playbook/.env; set +a; DENO_NO_PACKAGE_JSON=1 deno run -A scripts/invoices_test.ts
const FN = new URL("../supabase/functions", import.meta.url).pathname;
const U = Deno.env.get("VALOR_TRAINPRO_SUPABASE_URL")!.replace(/\/$/, ""), ANON = Deno.env.get("VALOR_TRAINPRO_SUPABASE_ANON_KEY")!;
Deno.env.set("SUPABASE_URL", U); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", Deno.env.get("VALOR_TRAINPRO_SUPABASE_SERVICE_ROLE_KEY")!);
const { admin } = await import(FN + "/_shared/common.ts");
const fails: string[] = [];
const check = (name: string, ok: boolean, got?: unknown) => { console.log((ok ? "ok   " : "FAIL ") + name + (ok ? "" : "  -> " + JSON.stringify(got)?.slice(0, 400))); if (!ok) fails.push(name); };

// ── stand-in Stripe ──
const invs: Record<string, any> = {}; let n = 0; const calls: string[] = [];
const fail = { items: false, send: false };
const fake = Deno.serve({ port: 8797, onListen: () => {} }, async (req) => {
  const u = new URL(req.url); const f = req.method === "POST" ? Object.fromEntries(new URLSearchParams(await req.text())) : {};
  calls.push(`${req.method} ${u.pathname}`);
  const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
  const parts = u.pathname.split("/"); // ["", "v1", "invoices", id, verb]
  if (u.pathname === "/v1/customers") return J({ id: `cus_fake${++n}` });
  if (u.pathname === "/v1/invoices" && req.method === "POST") { const id = `in_fake${++n}`; invs[id] = { id, status: "draft", total: 0, amount_paid: 0, metadata: f, customer: f.customer, status_transitions: {} }; return J(invs[id]); }
  if (u.pathname === "/v1/invoiceitems") {
    if (fail.items) return J({ error: { message: "This key can't add invoice items" } }, 403);
    const inv = invs[f.invoice]; inv.total += f.amount ? Number(f.amount) : Number(f.quantity) * Number(f.unit_amount_decimal); return J({ id: `ii_${++n}` });
  }
  if (u.pathname === "/v1/refunds") return J({ id: `re_${++n}`, amount: Object.values(invs).find((i: any) => i.payment_intent === f.payment_intent)?.amount_paid ?? 0 });
  const inv = invs[parts[3]];
  if (!inv) return J({ error: { message: "No such invoice" } }, 404);
  const verb = parts[4];
  if (req.method === "DELETE") { if (inv.status !== "draft") return J({ error: { message: "only drafts" } }, 400); delete invs[inv.id]; return J({ id: inv.id, deleted: true }); }
  if (verb === "finalize") { inv.status = "open"; inv.number = `VALOR-${n}`; inv.hosted_invoice_url = `https://invoice.stripe.test/${inv.id}`; inv.invoice_pdf = `https://pdf.stripe.test/${inv.id}`; }
  if (verb === "send") { if (fail.send) return J({ error: { message: "email failed" } }, 500); inv.sent = (inv.sent || 0) + 1; }
  if (verb === "void") { if (inv.status !== "open") return J({ error: { message: "can't void" } }, 400); inv.status = "void"; }
  if (verb === "pay") { inv.status = "paid"; inv.paid_out_of_band = true; inv.amount_paid = inv.total; inv.status_transitions.paid_at = Math.floor(Date.now() / 1000); }
  return J(inv);
});
const cardPay = (id: string) => { const i = invs[id]; i.status = "paid"; i.amount_paid = i.total; i.payment_intent = `pi_${id}`; i.status_transitions.paid_at = Math.floor(Date.now() / 1000); };

// ── the function, run locally against the stand-in ──
const PORT = 8000; // Deno.serve default
const web = new Deno.Command("deno", { args: ["run", "--allow-net", "--allow-env", "--allow-read", "--no-check", FN + "/invoices/index.ts"], env: { ...Deno.env.toObject(), DENO_NO_PACKAGE_JSON: "1", STRIPE_SECRET_KEY: "sk_fake", STRIPE_API_BASE: "http://localhost:8797", PORT: String(PORT) }, stdout: "null", stderr: "piped" }).spawn();
const STAFF = "vtp-inv-staff@valortrainpro.test", PARENT = "vtp-inv-parent@valortrainpro.test";
const TEST_CONTACT = "omar+renter@playbookmarketing.studio";
const RENTER = "4fdc69cf-6725-47f4-83e9-162e45a5166b";
const { data: tc } = await admin.from("billing_contacts").select("*").eq("email", TEST_CONTACT).single();
const { data: cfgRow } = await admin.from("settings").select("value").eq("key", "invoicing").single();
const blocks: string[] = [];
const clean = async () => {
  const { data: zz } = await admin.from("billing_contacts").select("id").like("email", "zzinv-%");
  const ids = [tc.id, ...(zz || []).map((x) => x.id)];
  const { data: rows } = await admin.from("invoices").select("id").in("contact_id", ids).gte("created_at", START);
  if (rows?.length) await admin.from("invoices").delete().in("id", rows.map((r) => r.id));
  if (zz?.length) await admin.from("billing_contacts").delete().in("id", zz.map((x) => x.id));
  if (blocks.length) await admin.from("facility_blocks").delete().in("id", blocks);
  for (const e of [STAFF, PARENT]) { const { data: p } = await admin.from("profiles").select("id").eq("email", e); for (const r of p || []) await admin.auth.admin.deleteUser(r.id); }
  await admin.from("settings").update({ value: cfgRow.value }).eq("key", "invoicing");
};
const START = new Date().toISOString();
const login = async (email: string, role?: string) => {
  const pw = crypto.randomUUID() + "aA1!";
  const { data, error } = await admin.auth.admin.createUser({ email, password: pw, email_confirm: true }); if (error) throw error;
  if (role) await admin.from("profiles").update({ role }).eq("id", data.user!.id);
  const r = await fetch(U + "/auth/v1/token?grant_type=password", { method: "POST", headers: { apikey: ANON, "content-type": "application/json" }, body: JSON.stringify({ email, password: pw }) });
  return { id: data.user!.id, jwt: (await r.json()).access_token as string };
};
let staffJwt = "";
const call = async (body: Record<string, unknown>, jwt = staffJwt) => {
  const r = await fetch(`http://localhost:${PORT}/`, { method: "POST", headers: { authorization: `Bearer ${jwt}`, "content-type": "application/json" }, body: JSON.stringify(body) });
  return { s: r.status, d: await r.json().catch(() => ({})) };
};
const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles" }).format(new Date());
const due = (() => { const [y, m, d] = today.split("-").map(Number); return new Date(Date.UTC(y, m - 1, d + 7)).toISOString().slice(0, 10); })();
const row = async (id: string) => (await admin.from("invoices").select("*").eq("id", id).single()).data;

try {
  await clean();
  for (let i = 0; i < 40; i++) { try { await fetch(`http://localhost:${PORT}/`, { method: "OPTIONS" }); break; } catch { await new Promise((r) => setTimeout(r, 250)); } }
  const staff = await login(STAFF, "admin"); staffJwt = staff.jwt;
  const parent = await login(PARENT);

  let r = await call({ action: "list" }, parent.jwt);
  check("a parent can't use it", r.s === 403, r);
  r = await call({ action: "list" });
  check("list works for a coach", r.s === 200 && Array.isArray(r.d.money) && Array.isArray(r.d.people), r.d);
  check("  test contact is in the people list", r.d.people.some((p: any) => p.contact_id === tc.id && p.is_example));
  check("  sending is off (not live)", r.d.setting.live === false);
  check("  all money has the existing autopay payments", r.d.money.some((m: any) => m.source === "autopay"));
  check("  test staff can't refund", r.d.can_refund === false);

  r = await call({ action: "contact_add", name: "ZZInv Person", email: "bad" });
  check("contact_add refuses a bad email", r.s === 400, r);
  r = await call({ action: "contact_add", name: "ZZInv Person", email: "zzinv-person@valortrainpro.test", phone: "509-555-0100" });
  check("contact_add makes a contact", r.s === 200 && r.d.contact?.id, r);
  const zz = r.d.contact;
  r = await call({ action: "contact_add", name: "Again", email: "ZZINV-person@valortrainpro.test" });
  check("  same email again returns the same contact", r.d.existing === true && r.d.contact.id === zz.id, r);

  const lines = [{ description: "Full turf rental", quantity: 3, unit_cents: 12500 }, { description: "Half turf", quantity: 1.5, unit_cents: 5000 }];
  r = await call({ action: "save", contact_id: zz.id, lines: [], due_date: due });
  check("save refuses no lines", r.s === 400, r);
  r = await call({ action: "save", contact_id: zz.id, lines, due_date: "2020-01-01" });
  check("save refuses a past due date", r.s === 400, r);
  r = await call({ action: "save", contact_id: zz.id, lines, due_date: due, memo: "Thanks!" });
  check("save makes a draft", r.s === 200 && r.d.id, r);
  const d1 = r.d.id;
  let x = await row(d1);
  check("  total = 3x125 + 1.5x50 = $450", x.total_cents === 45000 && x.status === "draft" && !x.stripe_invoice_id, x);
  r = await call({ action: "send", id: d1 });
  check("send to a real (non-test) contact is blocked while not live", r.s === 423, r);
  check("  nothing was made in Stripe", !calls.some((c) => c.startsWith("POST /v1/invoices")), calls);

  // test contact: the full send
  r = await call({ action: "save", contact_id: tc.id, lines, due_date: due, memo: "Test" });
  const d2 = r.d.id;
  r = await call({ action: "send", id: d2 });
  check("send to the test contact works", r.s === 200 && r.d.ok && r.d.url, r);
  x = await row(d2);
  const s2 = invs[x.stripe_invoice_id];
  check("  row is open with Stripe ids, link, PDF, number", x.status === "open" && x.hosted_url && x.pdf_url && x.stripe_number && x.sent_at, x);
  check("  Stripe total matches the app total", s2.total === 45000, s2);
  check("  Stripe invoice tagged kind=custom with the row id", s2.metadata["metadata[kind]"] === "custom" && s2.metadata["metadata[invoice_row_id]"] === d2, s2.metadata);
  check("  send_invoice, card only, emailed once", s2.metadata.collection_method === "send_invoice" && s2.metadata["payment_settings[payment_method_types][0]"] === "card" && s2.sent === 1, s2);
  r = await call({ action: "save", id: d2, contact_id: tc.id, lines, due_date: due });
  check("a sent invoice can't be edited", r.s === 409, r);
  r = await call({ action: "delete_draft", id: d2 });
  check("a sent invoice can't be deleted", r.s === 409, r);
  r = await call({ action: "resend", id: d2 });
  check("resend emails it again", r.s === 200 && invs[x.stripe_invoice_id].sent === 2, r);
  r = await call({ action: "mark_paid", id: d2, method: "venmo", note: "paid at the desk" });
  x = await row(d2);
  check("mark paid (Venmo) on a sent invoice", r.s === 200 && x.status === "paid" && x.paid_outside === "venmo" && invs[x.stripe_invoice_id].paid_out_of_band, x);
  r = await call({ action: "refund", id: d2 });
  check("refund refused for a staff login that isn't Corey/Michael", r.s === 403, r);

  // void
  r = await call({ action: "save", contact_id: tc.id, lines: [lines[0]], due_date: due });
  const d3 = r.d.id; await call({ action: "send", id: d3 });
  r = await call({ action: "void", id: d3 });
  x = await row(d3);
  check("void a sent invoice", r.s === 200 && x.status === "void" && x.voided_at, x);
  r = await call({ action: "void", id: d3 });
  check("  can't void twice", r.s === 409, r);

  // paid by card on Stripe's page -> list picks it up -> refund (as an allowed login)
  r = await call({ action: "save", contact_id: tc.id, lines: [lines[0]], due_date: due });
  const d4 = r.d.id; await call({ action: "send", id: d4 });
  x = await row(d4); cardPay(x.stripe_invoice_id);
  r = await call({ action: "list" });
  x = await row(d4);
  check("list reads a card payment back from Stripe", x.status === "paid" && x.amount_paid_cents === 37500 && x.paid_at, x);
  check("  it shows in all money as an invoice", r.d.money.some((m: any) => m.invoice_id === d4 && m.status === "paid"), null);
  await admin.from("settings").update({ value: { ...cfgRow.value, refund_emails: [...cfgRow.value.refund_emails, STAFF] } }).eq("key", "invoicing");
  r = await call({ action: "refund", id: d4 });
  x = await row(d4);
  check("refund (allowed login)", r.s === 200 && x.refunded_cents === 37500, r);
  r = await call({ action: "refund", id: d4 });
  check("  can't refund twice", r.s === 409, r);
  r = await call({ action: "refund", id: d2 });
  check("  can't refund one paid by Venmo", r.s === 409, r);
  await admin.from("settings").update({ value: cfgRow.value }).eq("key", "invoicing");

  // a Stripe error mid-way leaves nothing half-made
  r = await call({ action: "save", contact_id: tc.id, lines, due_date: due });
  const d5 = r.d.id; fail.items = true;
  const before = Object.keys(invs).length;
  r = await call({ action: "send", id: d5 }); fail.items = false;
  x = await row(d5);
  check("Stripe error on a line: app keeps the draft", r.s === 502 && x.status === "draft" && !x.stripe_invoice_id, r);
  check("  the half-made Stripe draft was deleted", Object.keys(invs).length === before, Object.keys(invs).length);
  fail.send = true;
  r = await call({ action: "send", id: d5 }); fail.send = false;
  x = await row(d5);
  check("made but the email failed: open, says Tap Resend", r.s === 502 && /Resend/.test(r.d.error) && x.status === "open" && x.hosted_url, r);
  r = await call({ action: "resend", id: d5 });
  check("  resend then works", r.s === 200, r);

  // booked days from the Facility calendar
  const mk = async (day: string) => {
    const { data, error } = await admin.from("facility_blocks").insert({ kind: "rental", renter_id: RENTER, space: "full", status: "approved", title: "ZZInv test", starts_at: `${day}T20:00:00-08:00`, ends_at: `${day}T22:00:00-08:00` }).select("id").single();
    if (error) throw error; blocks.push(data.id); return data.id;
  };
  const b1 = await mk("2026-11-02"), b2 = await mk("2026-11-04");
  r = await call({ action: "booked_days", contact_id: tc.id, from: "2026-11-01", to: "2026-11-06" });
  const days = r.d.days || [];
  check("booked days lists the renter's approved blocks", days.length === 2 && days.every((x: any) => !x.billed), r.d);
  check("  2 hours full turf = $250, labeled", days[0]?.amount_cents === 25000 && days[0]?.hours === 2 && /^Full turf, Mon Nov 2, 8 to 10pm$/.test(days[0]?.label), days[0]);
  r = await call({ action: "save", contact_id: tc.id, lines: [{ description: days[0].label, quantity: 2, unit_cents: 12500, block_id: b1 }], due_date: due });
  const d6 = r.d.id;
  r = await call({ action: "booked_days", contact_id: tc.id, from: "2026-11-01", to: "2026-11-06" });
  check("  a day on a draft shows as billed", r.d.days.find((x: any) => x.block_id === b1)?.billed && !r.d.days.find((x: any) => x.block_id === b2)?.billed, r.d);
  r = await call({ action: "save", contact_id: tc.id, lines: [{ description: "same day again", quantity: 2, unit_cents: 12500, block_id: b1 }], due_date: due });
  const { data: dl } = await admin.from("invoice_lines").select("block_id").eq("invoice_id", r.d.id);
  check("  the same day can't go on a second invoice (link dropped)", dl?.[0]?.block_id === null, dl);
  await call({ action: "delete_draft", id: d6 });
  r = await call({ action: "booked_days", contact_id: tc.id, from: "2026-11-01", to: "2026-11-06" });
  check("  deleting the draft frees the day", !r.d.days.find((x: any) => x.block_id === b1)?.billed, r.d);
  r = await call({ action: "booked_days", contact_id: zz.id });
  check("  a contact who isn't a renter has no booked days", Array.isArray(r.d.days) && r.d.days.length === 0, r.d);

  // people: renter / parent picks become contacts
  r = await call({ action: "delete_draft", id: d1 });
  check("delete a draft", r.s === 200 && !(await admin.from("invoices").select("id").eq("id", d1).maybeSingle()).data, r);
  const { data: ev } = await admin.from("invoice_events").select("action").eq("invoice_id", d2).order("at");
  check("who-did-what log", JSON.stringify(ev?.map((e) => e.action)) === JSON.stringify(["created", "sent", "resent", "marked_paid"]), ev);
} catch (e) {
  console.error(e); fails.push("crashed");
} finally {
  await clean();
  web.kill(); await fake.shutdown();
  console.log(fails.length ? `\n${fails.length} FAILED` : "\nall passed");
  Deno.exit(fails.length ? 1 : 0);
}
