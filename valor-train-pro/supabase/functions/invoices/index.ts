// ════════════════════════════════════════════════════════════════════════
// Edge Function · invoices  (Valor Train Pro) — coaches bill anyone with their own lines (Omar's go 11/19/2026)
// Plan: deliverables/Valor-App-Custom-Invoicing-Plan-2026-11-18.md. Coaches only.
//   list                      → invoices (with lines), people you can bill, and ALL money (invoices + every payments
//                               row: autopay months, drop-ins, cash/Venmo). Open invoices are refreshed from Stripe first.
//   contact_add {name,email,phone?,renter_id?}
//   save {id?, contact_id | person:{kind,id}, lines[], due_date, memo, pay_methods}   → a draft, only in the app
//   delete_draft {id}
//   booked_days {contact_id, from, to}  → approved rental blocks for that renter not on another invoice yet
//   send {id}      → Stripe customer + invoice + lines, finalize, Stripe emails the pay link
//   resend {id}    → Stripe emails it again
//   void {id}      → open invoices only
//   mark_paid {id, method, note?}  → paid outside Stripe (cash, Venmo, check). Stripe charges no invoicing fee on these
//   refund {id}    → paid by card through Stripe; only the logins in settings.invoicing.refund_emails (Corey, Michael)
// Safety: until settings.invoicing.live is true, send/resend only work for a test contact (is_example). The
// preview shares the live database, so nobody real can get an invoice early.
// Stripe objects carry metadata.kind=custom. The stripe-webhook only handles subscription invoices, so these never
// touch autopay. Status is read back from Stripe on list (no webhook change in this build).
// Stripe-Version is pinned to the one the other functions use (invoice.payment_intent is on the invoice).
// Deploy: supabase functions deploy invoices --no-verify-jwt --project-ref gpotwyuttkkygvxzktep --use-api
// ════════════════════════════════════════════════════════════════════════
import { admin, bad, cors, json, requireAdmin } from "../_shared/common.ts";
import { ptToUtc, TZ } from "../_shared/billing.ts";

const API = (Deno.env.get("STRIPE_API_BASE") || "https://api.stripe.com").replace(/\/$/, "");
const VERSION = "2025-02-24.acacia";
const money = (c: number) => `$${(c / 100).toFixed(c % 100 ? 2 : 0)}`;
const ymdRe = /^\d{4}-\d{2}-\d{2}$/;

class StripeError extends Error { constructor(message: string, public status: number) { super(message); } }
async function stripe(method: "GET" | "POST" | "DELETE", path: string, params?: Record<string, string>) {
  const key = Deno.env.get("STRIPE_SECRET_KEY");
  if (!key) throw new StripeError("Card payments aren't connected", 503);
  const res = await fetch(`${API}${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, "stripe-version": VERSION, ...(params ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    body: params ? new URLSearchParams(params) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new StripeError(data?.error?.message || `Stripe error ${res.status}`, res.status);
  return data;
}

type Cfg = { live: boolean; due_days: number; bank_enabled: boolean; refund_emails: string[] };
async function config(): Promise<Cfg> {
  const { data } = await admin.from("settings").select("value").eq("key", "invoicing").maybeSingle();
  const v = (data?.value || {}) as Partial<Cfg>;
  return { live: v.live === true, due_days: Number(v.due_days) || 7, bank_enabled: v.bank_enabled === true, refund_emails: (v.refund_emails || []).map((e) => String(e).toLowerCase()) };
}
async function facilityRates() {
  const { data } = await admin.from("settings").select("value").eq("key", "facility").maybeSingle();
  const r = (data?.value as any)?.rates || {};
  return { full: Number(r.full) || 12500, half: Number(r.half) || 5000 };
}
const log = (invoice_id: string, action: string, by_user: string, detail?: Record<string, unknown>) =>
  admin.from("invoice_events").insert({ invoice_id, action, by_user, detail: detail || null });

// ── Pacific time helpers ──
const ptFmt = (d: Date, o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("en-US", { timeZone: TZ, ...o }).format(d);
const todayPT = () => new Intl.DateTimeFormat("en-CA", { timeZone: TZ }).format(new Date());
function timePT(d: Date) {
  const [h, m] = ptFmt(d, { hour: "numeric", minute: "2-digit", hourCycle: "h23" }).split(":").map(Number);
  const h12 = h % 12 || 12;
  return { text: m ? `${h12}:${String(m).padStart(2, "0")}` : `${h12}`, ap: h < 12 ? "am" : "pm" };
}
/** "Full turf, Tue Nov 24, 6 to 9pm" */
function blockLabel(b: { space: string; starts_at: string; ends_at: string }) {
  const s = new Date(b.starts_at), e = new Date(b.ends_at);
  const a = timePT(s), z = timePT(e);
  const span = a.ap === z.ap ? `${a.text} to ${z.text}${z.ap}` : `${a.text}${a.ap} to ${z.text}${z.ap}`;
  return `${b.space === "half" ? "Half turf" : "Full turf"}, ${ptFmt(s, { weekday: "short" })} ${ptFmt(s, { month: "short", day: "numeric" })}, ${span}`;
}

// ── read ──
async function syncOpen() {
  const { data: open } = await admin.from("invoices").select("*").eq("status", "open").not("stripe_invoice_id", "is", null);
  for (const inv of open || []) {
    try { await applyStripe(inv, await stripe("GET", `/v1/invoices/${inv.stripe_invoice_id}`)); } catch (e) { console.error("sync", inv.id, (e as Error).message); }
  }
}
async function applyStripe(row: Record<string, any>, s: Record<string, any>) {
  const status = ["draft", "open", "paid", "void", "uncollectible"].includes(s.status) ? s.status : row.status;
  const paidAt = s.status_transitions?.paid_at ? new Date(s.status_transitions.paid_at * 1000).toISOString() : row.paid_at;
  const patch: Record<string, unknown> = {
    status, amount_paid_cents: s.amount_paid ?? row.amount_paid_cents, hosted_url: s.hosted_invoice_url || row.hosted_url, pdf_url: s.invoice_pdf || row.pdf_url,
    stripe_number: s.number || row.stripe_number, paid_at: status === "paid" ? paidAt : row.paid_at, synced_at: new Date().toISOString(),
  };
  if (status === "void" && !row.voided_at) patch.voided_at = new Date().toISOString();
  await admin.from("invoices").update(patch).eq("id", row.id);
  return { ...row, ...patch };
}

async function people() {
  const [{ data: contacts }, { data: renters }, { data: parents }] = await Promise.all([
    admin.from("billing_contacts").select("id, name, email, phone, renter_id, parent_id, is_example").is("archived_at", null).order("name"),
    admin.from("facility_renters").select("id, name, contact_name, contact_email, contact_phone, is_example").is("archived_at", null),
    admin.from("profiles").select("id, full_name, email").eq("role", "parent"),
  ]);
  const have = new Set((contacts || []).map((c) => c.email.toLowerCase()));
  const out: Record<string, unknown>[] = (contacts || []).map((c) => ({ key: `c:${c.id}`, contact_id: c.id, name: c.name, email: c.email, phone: c.phone, renter: !!c.renter_id, is_example: c.is_example, kind: c.renter_id ? "Renter" : c.parent_id ? "Parent" : "Contact" }));
  for (const r of renters || []) {
    const email = String(r.contact_email || "").toLowerCase();
    if (!email || have.has(email)) continue;
    have.add(email);
    out.push({ key: `r:${r.id}`, person: { kind: "renter", id: r.id }, name: r.contact_name ? `${r.contact_name} (${r.name})` : r.name, email, phone: r.contact_phone, renter: true, is_example: r.is_example, kind: "Renter" });
  }
  for (const p of parents || []) {
    const email = String(p.email || "").toLowerCase();
    if (!email || have.has(email) || email.endsWith(".test")) continue;
    have.add(email);
    out.push({ key: `p:${p.id}`, person: { kind: "parent", id: p.id }, name: p.full_name || email, email, renter: false, kind: "Parent" });
  }
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

async function list(staffEmail: string) {
  await syncOpen();
  const [cfg, ppl, { data: invoices }, { data: payments }] = await Promise.all([
    config(), people(),
    admin.from("invoices").select("*, contact:billing_contacts(id, name, email, phone, renter_id, is_example), lines:invoice_lines(*)").order("created_at", { ascending: false }),
    admin.from("payments").select("id, description, amount_cents, kind, method, status, paid_at, created_at, note, athlete:athletes(first_name, last_name, parent_name, is_example)").order("created_at", { ascending: false }).limit(2000),
  ]);
  const today = todayPT();
  const inv = (invoices || []).map((i) => ({ ...i, lines: (i.lines || []).sort((a: any, b: any) => a.position - b.position), overdue: i.status === "open" && i.due_date < today }));
  // ALL money: invoices that were sent or paid + every payments row that isn't an abandoned checkout
  const money: Record<string, unknown>[] = [];
  for (const i of inv) {
    if (i.status === "draft" && !i.paid_outside) continue;
    money.push({
      id: `i:${i.id}`, invoice_id: i.id, source: "invoice", who: i.contact?.name || "", what: i.lines.map((l: any) => l.description).join(", ") || "Invoice",
      amount_cents: i.total_cents, status: i.status === "open" ? (i.overdue ? "overdue" : "waiting") : i.status === "void" ? "voided" : i.refunded_cents ? "refunded" : i.status,
      method: i.paid_outside || (i.status === "paid" ? "card" : null), date: i.paid_at || i.sent_at || i.created_at, is_example: !!i.contact?.is_example,
    });
  }
  for (const p of payments || []) {
    if (p.status === "canceled" || p.status === "pending") continue;
    const a: any = p.athlete || {};
    const kid = [a.first_name, a.last_name].filter(Boolean).join(" ");
    money.push({
      id: `p:${p.id}`, source: p.kind === "subscription" ? "autopay" : "payment", who: kid + (a.parent_name ? ` (${a.parent_name})` : ""),
      what: String(p.description || "").split(" · ").filter((x: string) => x !== kid).join(" · "),
      amount_cents: p.amount_cents, status: p.status, method: p.method, date: p.paid_at || p.created_at, is_example: !!a.is_example, note: p.note,
    });
  }
  money.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return json({ setting: { live: cfg.live, due_days: cfg.due_days, bank_enabled: cfg.bank_enabled }, can_refund: cfg.refund_emails.includes(staffEmail.toLowerCase()), invoices: inv, people: ppl, money });
}

// ── write ──
async function contactFor(body: Record<string, any>, staffId: string) {
  if (body.contact_id) {
    const { data } = await admin.from("billing_contacts").select("*").eq("id", body.contact_id).is("archived_at", null).maybeSingle();
    return data;
  }
  const p = body.person || {};
  let row: Record<string, unknown> | null = null;
  if (p.kind === "renter") {
    const { data: r } = await admin.from("facility_renters").select("*").eq("id", p.id).maybeSingle();
    if (r?.contact_email) row = { name: r.contact_name ? `${r.contact_name} (${r.name})` : r.name, email: String(r.contact_email).toLowerCase(), phone: r.contact_phone, renter_id: r.id, is_example: r.is_example };
  } else if (p.kind === "parent") {
    const { data: pr } = await admin.from("profiles").select("id, full_name, email, role").eq("id", p.id).maybeSingle();
    if (pr?.email && pr.role === "parent") row = { name: pr.full_name || pr.email, email: String(pr.email).toLowerCase(), parent_id: pr.id };
  }
  if (!row) return null;
  const { data: existing } = await admin.from("billing_contacts").select("*").ilike("email", String(row.email)).is("archived_at", null).maybeSingle();
  if (existing) return existing;
  const { data } = await admin.from("billing_contacts").insert({ ...row, created_by: staffId }).select("*").single();
  return data;
}

async function contactAdd(body: Record<string, any>, staffId: string) {
  const name = String(body.name || "").trim(), email = String(body.email || "").trim().toLowerCase();
  if (!name) return bad("Add their name");
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("That email doesn't look right");
  const { data: existing } = await admin.from("billing_contacts").select("*").ilike("email", email).is("archived_at", null).maybeSingle();
  if (existing) return json({ contact: existing, existing: true });
  const { data, error } = await admin.from("billing_contacts").insert({
    name, email, phone: String(body.phone || "").trim() || null, renter_id: body.renter_id || null, created_by: staffId,
  }).select("*").single();
  if (error) return bad(error.message, 500);
  return json({ contact: data });
}

function cleanLines(lines: unknown) {
  if (!Array.isArray(lines) || !lines.length) return { error: "Add at least one line" };
  const out = [];
  for (const [i, l] of (lines as any[]).entries()) {
    const description = String(l.description || "").trim();
    const quantity = Math.round(Number(l.quantity || 1) * 100) / 100;
    const unit_cents = Math.round(Number(l.unit_cents));
    if (!description) return { error: `Line ${i + 1} needs a description` };
    if (!(quantity > 0) || quantity > 1000) return { error: `Line ${i + 1}: the quantity looks off` };
    if (!Number.isFinite(unit_cents) || unit_cents < 0 || unit_cents > 5000000) return { error: `Line ${i + 1}: the price looks off` };
    out.push({ position: i, description: description.slice(0, 250), quantity, unit_cents, amount_cents: Math.round(quantity * unit_cents), block_id: l.block_id || null });
  }
  return { lines: out };
}

async function save(body: Record<string, any>, staffId: string) {
  const cfg = await config();
  const contact = await contactFor(body, staffId);
  if (!contact) return bad("Pick who it's for");
  const cl = cleanLines(body.lines);
  if (cl.error) return bad(cl.error);
  const lines = cl.lines!;
  const total = lines.reduce((s, l) => s + l.amount_cents, 0);
  if (total < 50) return bad("Stripe needs an invoice of at least 50 cents");
  const due = String(body.due_date || "");
  if (!ymdRe.test(due) || due < todayPT()) return bad("Pick a due date today or later");
  const pay = (Array.isArray(body.pay_methods) ? body.pay_methods : ["card"]).filter((m: string) => m === "card" || (m === "us_bank_account" && cfg.bank_enabled));
  const fields = { contact_id: contact.id, due_date: due, memo: String(body.memo || "").trim().slice(0, 500) || null, pay_methods: pay.length ? pay : ["card"], total_cents: total };
  let id = body.id as string | undefined;
  if (id) {
    const { data: cur } = await admin.from("invoices").select("status").eq("id", id).maybeSingle();
    if (!cur) return bad("Invoice not found", 404);
    if (cur.status !== "draft") return bad("This invoice was already sent, so it can't be edited. Void it and make a new one.", 409);
    await admin.from("invoices").update(fields).eq("id", id);
    await admin.from("invoice_lines").delete().eq("invoice_id", id);
  } else {
    const { data, error } = await admin.from("invoices").insert({ ...fields, created_by: staffId }).select("id").single();
    if (error) return bad(error.message, 500);
    id = data.id;
  }
  // a booked day can only be on one live invoice
  const blockIds = lines.map((l) => l.block_id).filter(Boolean);
  if (blockIds.length) {
    const { data: taken } = await admin.from("invoice_lines").select("block_id, invoice:invoices!inner(id, status)").in("block_id", blockIds).neq("invoice.status", "void").neq("invoice_id", id);
    const t = new Set((taken || []).map((x: any) => x.block_id));
    for (const l of lines) if (l.block_id && t.has(l.block_id)) l.block_id = null;
  }
  const { error: le } = await admin.from("invoice_lines").insert(lines.map((l) => ({ ...l, invoice_id: id })));
  if (le) return bad(le.message, 500);
  await log(id!, body.id ? "edited" : "created", staffId, { total_cents: total });
  return json({ id });
}

async function deleteDraft(body: Record<string, any>) {
  const { data: cur } = await admin.from("invoices").select("status, stripe_invoice_id").eq("id", body.id).maybeSingle();
  if (!cur) return bad("Invoice not found", 404);
  if (cur.status !== "draft" || cur.stripe_invoice_id) return bad("Only a draft that was never sent can be deleted. Void it instead.", 409);
  await admin.from("invoices").delete().eq("id", body.id);
  return json({ ok: true });
}

async function bookedDays(body: Record<string, any>) {
  const { data: c } = await admin.from("billing_contacts").select("renter_id").eq("id", body.contact_id).maybeSingle();
  if (!c?.renter_id) return json({ days: [] });
  const from = ymdRe.test(body.from) ? body.from : todayPT().slice(0, 8) + "01";
  const to = ymdRe.test(body.to) ? body.to : todayPT();
  const [fy, fm, fd] = from.split("-").map(Number), [ty, tm, td] = to.split("-").map(Number);
  const { data: blocks } = await admin.from("facility_blocks").select("id, space, starts_at, ends_at, title")
    .eq("renter_id", c.renter_id).eq("status", "approved").eq("kind", "rental")
    .gte("starts_at", ptToUtc(fy, fm, fd, 0).toISOString()).lt("starts_at", ptToUtc(ty, tm, td + 1, 0).toISOString()).order("starts_at");
  const ids = (blocks || []).map((b) => b.id);
  const billed = new Set<string>();
  if (ids.length) {
    const { data: taken } = await admin.from("invoice_lines").select("block_id, invoice:invoices!inner(id, status)").in("block_id", ids).neq("invoice.status", "void");
    for (const t of taken || []) billed.add((t as any).block_id);
  }
  const rates = await facilityRates();
  return json({
    days: (blocks || []).map((b) => {
      const hours = Math.round(((new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 3600000) * 100) / 100;
      const rate = b.space === "half" ? rates.half : rates.full;
      return { block_id: b.id, label: blockLabel(b), hours, rate_cents: rate, amount_cents: Math.round(hours * rate), billed: billed.has(b.id) };
    }),
  });
}

async function loadInvoice(id: string) {
  const { data } = await admin.from("invoices").select("*, contact:billing_contacts(*), lines:invoice_lines(*)").eq("id", id).maybeSingle();
  if (data) data.lines = (data.lines || []).sort((a: any, b: any) => a.position - b.position);
  return data;
}
async function guardLive(inv: Record<string, any>) {
  const cfg = await config();
  if (!cfg.live && !inv.contact?.is_example) return bad("Sending is switched off until the invoicing page goes live. Only a test contact can get one right now.", 423);
  if (String(inv.contact?.email || "").endsWith(".test")) return bad("That's a .test email, Stripe can't send to it", 409);
  return null;
}

async function send(body: Record<string, any>, staffId: string) {
  const inv = await loadInvoice(String(body.id || ""));
  if (!inv) return bad("Invoice not found", 404);
  if (inv.status !== "draft" || inv.stripe_invoice_id) return bad("This invoice was already sent", 409);
  const g = await guardLive(inv); if (g) return g;
  if (inv.due_date < todayPT()) return bad("The due date has passed. Edit the draft and pick a new one.", 409);
  if (!inv.lines.length || inv.total_cents < 50) return bad("Add at least one line");
  const c = inv.contact;
  let stripeInv: Record<string, any> | null = null;
  try {
    let customer = c.stripe_customer_id as string | null;
    if (!customer) {
      const cu = await stripe("POST", "/v1/customers", { name: c.name, email: c.email, ...(c.phone ? { phone: c.phone } : {}), "metadata[kind]": "custom", "metadata[contact_id]": c.id });
      customer = cu.id as string;
      await admin.from("billing_contacts").update({ stripe_customer_id: customer }).eq("id", c.id);
    }
    const [y, m, d] = inv.due_date.split("-").map(Number);
    const params: Record<string, string> = {
      customer, collection_method: "send_invoice", due_date: String(Math.floor(ptToUtc(y, m, d, 23).getTime() / 1000)),
      auto_advance: "false", pending_invoice_items_behavior: "exclude",
      "metadata[kind]": "custom", "metadata[invoice_row_id]": inv.id,
    };
    if (inv.memo) params.description = inv.memo;
    inv.pay_methods.forEach((pm: string, i: number) => { params[`payment_settings[payment_method_types][${i}]`] = pm; });
    stripeInv = await stripe("POST", "/v1/invoices", params);
    for (const l of inv.lines) {
      const whole = Number.isInteger(Number(l.quantity));
      await stripe("POST", "/v1/invoiceitems", {
        customer, invoice: stripeInv!.id, currency: "usd", "metadata[kind]": "custom", "metadata[line_id]": l.id,
        ...(whole
          ? { description: l.description, quantity: String(Number(l.quantity)), unit_amount_decimal: String(l.unit_cents) }
          : { description: `${l.description} (${Number(l.quantity)} x ${money(l.unit_cents)})`, amount: String(l.amount_cents) }),
      });
    }
    const fin = await stripe("POST", `/v1/invoices/${stripeInv!.id}/finalize`, { auto_advance: "false" });
    if (fin.total !== inv.total_cents) console.error("total mismatch", inv.id, fin.total, inv.total_cents);
    const sent = await stripe("POST", `/v1/invoices/${stripeInv!.id}/send`);
    const now = new Date().toISOString();
    await admin.from("invoices").update({
      status: sent.status === "paid" ? "paid" : "open", stripe_invoice_id: sent.id, stripe_number: sent.number, hosted_url: sent.hosted_invoice_url,
      pdf_url: sent.invoice_pdf, total_cents: sent.total ?? inv.total_cents, sent_at: now, sent_by: staffId, synced_at: now,
    }).eq("id", inv.id);
    await log(inv.id, "sent", staffId, { to: c.email, stripe_invoice_id: sent.id, total: sent.total });
    return json({ ok: true, to: c.email, url: sent.hosted_invoice_url, number: sent.number });
  } catch (e) {
    // nothing half-made stays in Stripe: a draft Stripe invoice is deleted, the app keeps its draft
    if (stripeInv?.id) {
      try {
        const cur = await stripe("GET", `/v1/invoices/${stripeInv.id}`);
        if (cur.status === "draft") await stripe("DELETE", `/v1/invoices/${stripeInv.id}`);
        else { // finalized but /send failed: it exists, keep track of it so it can be resent
          await admin.from("invoices").update({ status: cur.status, stripe_invoice_id: cur.id, stripe_number: cur.number, hosted_url: cur.hosted_invoice_url, pdf_url: cur.invoice_pdf, sent_by: staffId }).eq("id", inv.id);
          await log(inv.id, "finalized_not_emailed", staffId, { error: (e as Error).message });
          return bad(`The invoice is made but Stripe didn't email it: ${(e as Error).message}. Tap Resend.`, 502);
        }
      } catch (e2) { console.error("cleanup failed", (e2 as Error).message); }
    }
    await log(inv.id, "send_failed", staffId, { error: (e as Error).message });
    return bad(`Stripe said no: ${(e as Error).message}`, 502);
  }
}

async function onOpen(body: Record<string, any>, staffId: string, act: "resend" | "void" | "mark_paid") {
  const inv = await loadInvoice(String(body.id || ""));
  if (!inv) return bad("Invoice not found", 404);
  if (act === "mark_paid") {
    const method = ["cash", "venmo", "check", "other"].includes(body.method) ? body.method : null;
    if (!method) return bad("How did they pay?");
    if (inv.status === "draft" && !inv.stripe_invoice_id) { // never sent: just record it
      await admin.from("invoices").update({ status: "paid", paid_outside: method, paid_at: new Date().toISOString(), amount_paid_cents: inv.total_cents }).eq("id", inv.id);
    } else {
      if (inv.status !== "open") return bad("Only an unpaid invoice can be marked paid", 409);
      const s = await stripe("POST", `/v1/invoices/${inv.stripe_invoice_id}/pay`, { paid_out_of_band: "true" });
      await applyStripe(inv, s);
      await admin.from("invoices").update({ paid_outside: method }).eq("id", inv.id);
    }
    await log(inv.id, "marked_paid", staffId, { method, note: String(body.note || "").slice(0, 300) || null });
    return json({ ok: true });
  }
  if (inv.status !== "open" || !inv.stripe_invoice_id) return bad(act === "void" ? "Only a sent, unpaid invoice can be voided. A draft can just be deleted." : "Only a sent, unpaid invoice can be resent", 409);
  if (act === "resend") {
    const g = await guardLive(inv); if (g) return g;
    await stripe("POST", `/v1/invoices/${inv.stripe_invoice_id}/send`);
    await log(inv.id, "resent", staffId, { to: inv.contact?.email });
    return json({ ok: true, to: inv.contact?.email });
  }
  const s = await stripe("POST", `/v1/invoices/${inv.stripe_invoice_id}/void`);
  await applyStripe(inv, s);
  await log(inv.id, "voided", staffId);
  return json({ ok: true });
}

async function refund(body: Record<string, any>, staff: { id: string; email?: string }) {
  const cfg = await config();
  if (!cfg.refund_emails.includes(String(staff.email || "").toLowerCase())) return bad("Only Corey and Michael can refund", 403);
  const inv = await loadInvoice(String(body.id || ""));
  if (!inv) return bad("Invoice not found", 404);
  if (inv.status !== "paid" || inv.paid_outside || !inv.stripe_invoice_id) return bad("Only an invoice paid by card through Stripe can be refunded here", 409);
  if (inv.refunded_cents) return bad("This invoice was already refunded", 409);
  const s = await stripe("GET", `/v1/invoices/${inv.stripe_invoice_id}`);
  const pi = typeof s.payment_intent === "string" ? s.payment_intent : s.payment_intent?.id;
  if (!pi) return bad("Stripe has no card payment on this invoice", 409);
  const r = await stripe("POST", "/v1/refunds", { payment_intent: pi, "metadata[kind]": "custom", "metadata[invoice_row_id]": inv.id });
  await admin.from("invoices").update({ refunded_cents: r.amount }).eq("id", inv.id);
  await log(inv.id, "refunded", staff.id, { amount: r.amount, refund: r.id });
  return json({ ok: true, amount_cents: r.amount });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return bad("POST only", 405);
  const staff = await requireAdmin(req);
  if (!staff) return bad("Coaches only", 403);
  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* empty */ }
  try {
    switch (body.action) {
      case "list": return await list(String(staff.email || ""));
      case "contact_add": return await contactAdd(body, staff.id);
      case "save": return await save(body, staff.id);
      case "delete_draft": return await deleteDraft(body);
      case "booked_days": return await bookedDays(body);
      case "send": return await send(body, staff.id);
      case "resend": return await onOpen(body, staff.id, "resend");
      case "void": return await onOpen(body, staff.id, "void");
      case "mark_paid": return await onOpen(body, staff.id, "mark_paid");
      case "refund": return await refund(body, staff);
      default: return bad("unknown action");
    }
  } catch (e) {
    if (e instanceof StripeError) return bad(`Stripe said no: ${e.message}`, 502);
    console.error("invoices failed", e);
    return bad("Something went wrong. Text Omar.", 500);
  }
});
