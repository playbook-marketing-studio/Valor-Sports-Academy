// ════════════════════════════════════════════════════════════════════════
// Edge Function · facility  (Valor Train Pro) — the facility rental calendar
//   Renters (a login that belongs to a facility_renters group) see what is open and ask for a time.
//   Coaches approve or decline, add their own blocks (one-off or every week) and invite renters.
//   Billing stays outside the app. Times are Pacific. Rules live in settings key "facility" (DEFAULTS below).
//
//   POST {action:"calendar", from, to}                    → the calendar for those Pacific dates
//        renter: other groups show only as "booked", Valor's own time only as "valor" (no names, no notes)
//        staff:  everything, plus requests waiting, renters and the Google Calendar status
//   POST {action:"request", date, start_min, end_min, space, note, renter_id?}   renter → a pending request
//   POST {action:"cancel", id}                            renter → pulls back a request that is still waiting
//   — staff only —
//   POST {action:"decide", id, approve, staff_note?, force?}   force = approve over a Google Calendar event
//   POST {action:"save_blocks", kind, renter_id?, title?, space, date, start_min, end_min, repeat?:{days:[1..7], until}}
//   POST {action:"update_block", id, scope:"one"|"series", date?, start_min, end_min, space?, title?}
//   POST {action:"delete_block", id, scope:"one"|"series"}
//   POST {action:"save_renter", id?, name, contact_name?, contact_email?, contact_phone?, is_example?, archived?}
//   POST {action:"invite_member", renter_id, email, full_name?}   → emails them a login (or a "you're in" note)
//   POST {action:"remove_member", renter_id, user_id}
//   POST {action:"gcal_connect"} → {url} Google's Allow screen · {action:"gcal_disconnect"} · {action:"gcal_sync"}
//   GET  /facility/gcal-callback                          Google sends the coach back here (see gcal.ts)
// Deploy: supabase functions deploy facility --no-verify-jwt --project-ref gpotwyuttkkygvxzktep --use-api
// ════════════════════════════════════════════════════════════════════════
import { admin, appOrigin, bad, cors, json, userFromRequest } from "../_shared/common.ts";
import { btn, esc, mailConfigured, quote, sendMail, wrapHtml, type Mail } from "../_shared/mail.ts";
import { addDays, fmtRange, isYmd, partsPT, ptToUtc, weekdayOf } from "./time.ts";
import * as gcal from "./gcal.ts";

const DEFAULTS = {
  open_min: 360,       // renters can ask for 6am ...
  close_min: 1320,     // ... to 10pm
  min_minutes: 60,     // shortest rental
  step: 30,            // times land on the half hour
  notice_hours: 24,    // a request needs at least this much notice
  horizon_days: 90,    // and can be at most this far out
  rates: { full: 12500, half: 5000 }, // cents per hour, shown to the renter (same as the site's rate card)
  alert_to: null as string[] | null,  // who hears about a new request; null = every coach (staff_allowlist)
};
type Cfg = typeof DEFAULTS;
const TEST_ONLY = "omar@playbookmarketing.studio";
const appUrl = (req: Request) => appOrigin(req);

async function config(): Promise<Cfg> {
  const { data } = await admin.from("settings").select("value").eq("key", "facility").maybeSingle();
  const v = (data?.value || {}) as Partial<Cfg>;
  return { ...DEFAULTS, ...v, rates: { ...DEFAULTS.rates, ...(v.rates || {}) } };
}

const unitsOf = (b: { kind: string; space: string }) => (b.kind === "rental" && b.space === "half" ? 1 : 2);
async function unitsFree(start: Date, end: Date, exclude: string | null, withGoogle: boolean): Promise<number> {
  const { data, error } = await admin.rpc("facility_units_free", { p_start: start.toISOString(), p_end: end.toISOString(), p_exclude: exclude, p_gcal: withGoogle });
  if (error) throw error;
  return Number(data);
}
const isConflict = (e: { message?: string } | null) => !!e?.message?.includes("facility_conflict");

function readSlot(date: unknown, startMin: unknown, endMin: unknown) {
  const s = Number(startMin), e = Number(endMin);
  if (!isYmd(date) || !Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e > 1440 || e <= s) return null;
  return { date, s, e, start: ptToUtc(date, s), end: ptToUtc(date, e) };
}

// ── email ────────────────────────────────────────────────────────────────
const real = (list: (string | null | undefined)[]) => [...new Set(list.map((x) => String(x || "").trim().toLowerCase()).filter((x) => x.includes("@") && !x.endsWith(".test")))];

/** Send once per key (message_alerts). Never throws: a failed email must not undo the booking. */
async function sendOnce(key: string, mail: Mail): Promise<{ sent: boolean; reason?: string }> {
  const to = real(Array.isArray(mail.to) ? mail.to : [mail.to]);
  if (!to.length) return { sent: false, reason: "no address to email" };
  if (!mailConfigured()) return { sent: false, reason: "email not configured" };
  const { error } = await admin.from("message_alerts").insert({ key });
  if (error) return { sent: false, reason: error.code === "23505" ? "already sent" : "could not record the alert" };
  try {
    await sendMail({ ...mail, to });
    return { sent: true };
  } catch (e) {
    console.error("facility mail failed", key, (e as Error).message);
    await admin.from("message_alerts").delete().eq("key", key);
    return { sent: false, reason: "send failed" };
  }
}

async function coachEmails(cfg: Cfg, example: boolean): Promise<string[]> {
  if (example) return [TEST_ONLY];
  if (Array.isArray(cfg.alert_to) && cfg.alert_to.length) return real(cfg.alert_to);
  const { data } = await admin.from("staff_allowlist").select("email");
  return real((data || []).map((r) => r.email));
}

async function renterEmails(renter: Record<string, any>): Promise<string[]> {
  const { data } = await admin.from("facility_renter_members").select("email").eq("renter_id", renter.id);
  const list = real((data || []).map((m) => m.email));
  return list.length ? list : real([renter.contact_email]);
}

const spaceLabel = (space: string) => (space === "half" ? "Half the turf" : "Full turf and weight room");
const dollars = (cents: number) => `$${(cents / 100).toFixed(cents % 100 ? 2 : 0)}`;
function priceLine(cfg: Cfg, b: Record<string, any>) {
  const hours = (new Date(b.ends_at).getTime() - new Date(b.starts_at).getTime()) / 3600000;
  const rate = b.space === "half" ? cfg.rates.half : cfg.rates.full;
  return `${hours === 1 ? "1 hour" : `${hours} hours`} at ${dollars(rate)} an hour, ${dollars(Math.round(rate * hours))}`;
}

async function alertCoaches(req: Request, cfg: Cfg, b: Record<string, any>, renter: Record<string, any>, requesterEmail: string) {
  if (renter.is_example && requesterEmail.toLowerCase().endsWith(".test")) return { sent: false, reason: "test login" };
  const when = fmtRange(b.starts_at, b.ends_at);
  const subject = `Rental request: ${renter.name}, ${when}`;
  const link = `${appUrl(req)}/admin/facility`;
  return await sendOnce(`fac:${b.id}:new`, {
    to: await coachEmails(cfg, !!renter.is_example), subject,
    text: `${renter.name} asked for the floor. ${when}. ${spaceLabel(b.space)}. ${priceLine(cfg, b)}. ${b.note ? `Their note: ${b.note}. ` : ""}Approve or decline it in the app: ${link}`,
    html: wrapHtml(subject,
      `<p><strong>${esc(renter.name)}</strong> asked for the floor.</p>
       <p>${esc(when)}<br>${esc(spaceLabel(b.space))}<br>${esc(priceLine(cfg, b))}</p>
       ${b.note ? quote(b.note) : ""}
       ${btn(link, "Approve or decline")}`,
      "Nothing is booked until a coach approves it. The renter gets an email either way."),
  });
}

async function tellRenter(req: Request, cfg: Cfg, b: Record<string, any>, renter: Record<string, any>, what: "approved" | "declined") {
  const when = fmtRange(b.starts_at, b.ends_at);
  const link = `${appUrl(req)}/facility`;
  const approved = what === "approved";
  const subject = approved ? `You're booked at Valor: ${when}` : `Valor can't do ${when}`;
  return await sendOnce(`fac:${b.id}:${what}`, {
    to: await renterEmails(renter), subject,
    text: approved
      ? `Your time at Valor is confirmed. ${when}. ${spaceLabel(b.space)}. ${priceLine(cfg, b)}, paid to Valor directly. See your times: ${link}`
      : `Valor couldn't approve the time you asked for (${when}). ${b.staff_note ? `Note from the coach: ${b.staff_note}. ` : ""}Pick another open time: ${link}`,
    html: wrapHtml(approved ? "Your time is confirmed" : "That time didn't work",
      approved
        ? `<p>${esc(when)}<br>${esc(spaceLabel(b.space))}<br>${esc(priceLine(cfg, b))}, paid to Valor directly.</p>
           <p>1973 Fowler Street, Richland.</p>${btn(link, "See your times")}`
        : `<p>Valor couldn't approve the time you asked for: ${esc(when)}.</p>
           ${b.staff_note ? quote(b.staff_note) : ""}
           ${btn(link, "Pick another time")}`,
      "Questions? Reply to this email or text 509-987-4612."),
  });
}

async function tellRenterCanceled(req: Request, renter: Record<string, any>, blocks: Record<string, any>[]) {
  if (!blocks.length || renter.is_example) return { sent: false, reason: "not emailed" };
  const lines = blocks.slice(0, 12).map((b) => fmtRange(b.starts_at, b.ends_at));
  const more = blocks.length > 12 ? ` and ${blocks.length - 12} more` : "";
  const subject = blocks.length === 1 ? `Valor canceled your time: ${lines[0]}` : `Valor canceled ${blocks.length} of your times`;
  const link = `${appUrl(req)}/facility`;
  return await sendOnce(`fac:${blocks[0].id}:canceled:${Date.now()}`, {
    to: await renterEmails(renter), subject,
    text: `A coach took these off the calendar: ${lines.join("; ")}${more}. See what's open: ${link}`,
    html: wrapHtml(subject, `<p>A coach took ${blocks.length === 1 ? "this" : "these"} off the calendar:</p><p>${lines.map(esc).join("<br>")}${esc(more)}</p>${btn(link, "See what's open")}`,
      "Questions? Reply to this email or text 509-987-4612."),
  });
}

// ── Google Calendar ──────────────────────────────────────────────────────
/** Push what changed to Google, quietly. The calendar load retries anything that didn't make it. */
async function pushToGoogle(limit = 40) {
  try {
    const row = await gcal.gcalRow();
    if (gcal.isConnected(row)) return await gcal.syncOut(row!, limit);
  } catch (e) { console.error("gcal push failed", (e as Error).message); }
  return null;
}

async function googleStatus() {
  const row = await gcal.gcalRow();
  return {
    configured: gcal.gcalConfigured(), connected: gcal.isConnected(row), email: row?.email || null,
    connected_at: row?.connected_at || null, last_sync_at: row?.last_sync_at || null, error: row?.last_error || null,
  };
}

// ── renters ──────────────────────────────────────────────────────────────
async function myRenters(userId: string) {
  const { data } = await admin.from("facility_renter_members").select("renter_id, facility_renters(id, name, is_example, archived_at, contact_email)").eq("user_id", userId);
  return (data || []).map((m: any) => m.facility_renters).filter((r: any) => r && !r.archived_at) as Record<string, any>[];
}

// ── calendar ─────────────────────────────────────────────────────────────
async function calendar(user: { id: string }, isStaff: boolean, body: Record<string, any>) {
  if (!isYmd(body.from) || !isYmd(body.to) || body.to < body.from || addDays(body.from, 45) < body.to) return bad("pick a week or a month");
  const start = ptToUtc(body.from, 0), end = ptToUtc(body.to, 1440);
  const cfg = await config();
  const mine = isStaff ? [] : await myRenters(user.id);
  if (!isStaff && !mine.length) return json({ role: "none" });

  // what is on Valor's Google Calendar for this window, fresh every load
  const row = await gcal.gcalRow();
  let googleError: string | null = null;
  if (gcal.isConnected(row)) {
    try { await gcal.refreshBusy(row!, start, end); } catch (e) { googleError = (e as Error).message; }
    if (isStaff) await pushToGoogle(20);
  }

  const [{ data: blocks }, { data: busy }] = await Promise.all([
    admin.from("facility_blocks").select("*, facility_renters(name, is_example)").lt("starts_at", end.toISOString()).gt("ends_at", start.toISOString()).in("status", ["approved", "pending"]).order("starts_at"),
    admin.from("facility_gcal_busy").select("event_id, title, starts_at, ends_at").lt("starts_at", end.toISOString()).gt("ends_at", start.toISOString()).order("starts_at"),
  ]);
  const rules = { open_min: cfg.open_min, close_min: cfg.close_min, min_minutes: cfg.min_minutes, step: cfg.step, notice_hours: cfg.notice_hours, horizon_days: cfg.horizon_days, rates: cfg.rates };

  if (!isStaff) {
    const ids = new Set(mine.map((r) => r.id));
    const out: Record<string, any>[] = [];
    for (const b of blocks || []) {
      const own = b.renter_id && ids.has(b.renter_id);
      if (b.status === "pending" && !own) continue; // someone else's request is nobody's business
      if (own) out.push({ id: b.id, kind: b.status === "pending" ? "mine_pending" : "mine", space: b.space, starts_at: b.starts_at, ends_at: b.ends_at, note: b.note, series_id: b.series_id });
      else if (b.kind === "rental") out.push({ kind: "booked", space: b.space, starts_at: b.starts_at, ends_at: b.ends_at });
      else out.push({ kind: "valor", space: "full", starts_at: b.starts_at, ends_at: b.ends_at });
    }
    for (const g of busy || []) out.push({ kind: "valor", space: "full", starts_at: g.starts_at, ends_at: g.ends_at });
    const now = new Date().toISOString(), recent = new Date(Date.now() - 14 * 86400000).toISOString();
    const { data: reqs } = await admin.from("facility_blocks")
      .select("id, renter_id, space, starts_at, ends_at, status, series_id, note, staff_note, updated_at")
      .in("renter_id", [...ids]).eq("kind", "rental")
      .or(`and(status.in.(pending,approved),ends_at.gt."${now}"),and(status.in.(declined,canceled),updated_at.gt."${recent}")`)
      .order("starts_at").limit(400);
    return json({ role: "renter", rules, renters: mine.map((r) => ({ id: r.id, name: r.name })), blocks: out, requests: reqs || [] });
  }

  // staff: requests waiting (any date), with a heads-up when one can't be approved as is
  const { data: pend } = await admin.from("facility_blocks").select("*, facility_renters(name, is_example)").eq("status", "pending").gt("ends_at", new Date().toISOString()).order("starts_at").limit(100);
  const waiting = [];
  for (const b of pend || []) {
    const s = new Date(b.starts_at), e = new Date(b.ends_at);
    let conflict: string | null = null, detail = "";
    if (await unitsFree(s, e, b.id, false) < unitsOf(b)) conflict = "booked";
    else if (await unitsFree(s, e, b.id, true) < unitsOf(b)) {
      conflict = "google";
      const { data: g } = await admin.from("facility_gcal_busy").select("title, starts_at, ends_at").lt("starts_at", b.ends_at).gt("ends_at", b.starts_at).limit(3);
      detail = (g || []).map((x) => `${x.title || "an event"} (${fmtRange(x.starts_at, x.ends_at).split(", ").slice(2).join(", ")})`).join(", ");
    }
    waiting.push({ ...pub(b), conflict, conflict_detail: detail });
  }
  const { data: renters } = await admin.from("facility_renters").select("*, facility_renter_members(user_id, email, full_name, invited_at)").is("archived_at", null).order("name");
  return json({
    role: "staff", rules, blocks: (blocks || []).map(pub), busy: busy || [], waiting, renters: renters || [],
    google: { ...(await googleStatus()), error: googleError || row?.last_error || null },
  });
}

/** A block as staff see it. */
function pub(b: Record<string, any>) {
  return {
    id: b.id, kind: b.kind, renter_id: b.renter_id, renter: b.facility_renters?.name || null, title: b.title, space: b.space,
    starts_at: b.starts_at, ends_at: b.ends_at, status: b.status, series_id: b.series_id, note: b.note, staff_note: b.staff_note,
    on_google: !!b.gcal_event_id, google_error: b.gcal_error || null,
  };
}

// ── renter actions ───────────────────────────────────────────────────────
async function request(req: Request, user: { id: string; email?: string }, body: Record<string, any>) {
  const mine = await myRenters(user.id);
  const renter = body.renter_id ? mine.find((r) => r.id === body.renter_id) : mine[0];
  if (!renter) return bad("this login isn't set up to rent the facility", 403);
  const cfg = await config();
  const slot = readSlot(body.date, body.start_min, body.end_min);
  if (!slot) return bad("pick a date, a start and an end");
  const space = body.space === "half" ? "half" : "full";
  if (slot.s % cfg.step || slot.e % cfg.step) return bad(`times are in ${cfg.step} minute steps`);
  if (slot.e - slot.s < cfg.min_minutes) return bad(`the shortest rental is ${cfg.min_minutes === 60 ? "1 hour" : `${cfg.min_minutes} minutes`}`);
  if (slot.s < cfg.open_min || slot.e > cfg.close_min) return bad("that's outside the hours the floor can be rented");
  if (slot.start.getTime() < Date.now() + cfg.notice_hours * 3600000) return bad(`requests need at least ${cfg.notice_hours} hours notice. For something sooner, text 509-987-4612.`);
  if (slot.date > addDays(partsPT(new Date()).ymd, cfg.horizon_days)) return bad(`you can ask for times up to ${cfg.horizon_days} days out`);

  // fresh look at Valor's Google Calendar for that day before saying it's open
  const row = await gcal.gcalRow();
  if (gcal.isConnected(row)) { try { await gcal.refreshBusy(row!, ptToUtc(slot.date, 0), ptToUtc(slot.date, 1440)); } catch { /* use the cache */ } }
  if (await unitsFree(slot.start, slot.end, null, true) < (space === "half" ? 1 : 2)) return bad("That time is already taken. Pick an open spot on the calendar.", 409);

  const { count } = await admin.from("facility_blocks").select("id", { count: "exact", head: true }).eq("renter_id", renter.id).eq("status", "pending").gt("ends_at", new Date().toISOString());
  if ((count || 0) >= 12) return bad("You have a lot of requests waiting. Give the coaches a chance to answer those first.", 429);
  const { data: dup } = await admin.from("facility_blocks").select("id").eq("renter_id", renter.id).eq("status", "pending").eq("starts_at", slot.start.toISOString()).eq("ends_at", slot.end.toISOString()).limit(1);
  if (dup?.length) return bad("You already asked for that time. It's waiting on a coach.", 409);

  const { data: b, error } = await admin.from("facility_blocks").insert({
    kind: "rental", renter_id: renter.id, space, starts_at: slot.start.toISOString(), ends_at: slot.end.toISOString(),
    status: "pending", note: String(body.note || "").trim().slice(0, 500) || null, requested_by: user.id, created_by: user.id,
  }).select("*").single();
  if (error) return bad("could not save the request", 500);
  const alert = await alertCoaches(req, cfg, b, renter, user.email || "");
  return json({ ok: true, id: b.id, status: "pending", coaches_emailed: alert.sent });
}

async function cancel(user: { id: string }, body: Record<string, any>) {
  const mine = await myRenters(user.id);
  const { data: b } = await admin.from("facility_blocks").select("id, renter_id, status").eq("id", String(body.id || "")).maybeSingle();
  if (!b || !mine.some((r) => r.id === b.renter_id)) return bad("request not found", 404);
  if (b.status === "approved") return bad("That time is already confirmed. To change it, text 509-987-4612.", 409);
  if (b.status !== "pending") return bad("that request is already closed", 409);
  await admin.from("facility_blocks").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("id", b.id).eq("status", "pending");
  return json({ ok: true });
}

// ── staff actions ────────────────────────────────────────────────────────
async function decide(req: Request, staffId: string, body: Record<string, any>) {
  const { data: b } = await admin.from("facility_blocks").select("*, facility_renters(*)").eq("id", String(body.id || "")).maybeSingle();
  if (!b) return bad("request not found", 404);
  if (b.status !== "pending") return bad("that request was already answered", 409);
  const cfg = await config();
  const renter = b.facility_renters;
  const now = new Date().toISOString();
  if (!body.approve) {
    const staff_note = String(body.staff_note || "").trim().slice(0, 500) || null;
    const { data: d } = await admin.from("facility_blocks").update({ status: "declined", staff_note, decided_by: staffId, decided_at: now, updated_at: now }).eq("id", b.id).eq("status", "pending").select("*").maybeSingle();
    if (!d) return bad("that request was already answered", 409);
    const mail = await tellRenter(req, cfg, d, renter, "declined");
    return json({ ok: true, status: "declined", renter_emailed: mail.sent });
  }
  const s = new Date(b.starts_at), e = new Date(b.ends_at);
  if (!body.force && await unitsFree(s, e, b.id, false) >= unitsOf(b) && await unitsFree(s, e, b.id, true) < unitsOf(b)) {
    return json({ error: "That overlaps something on Valor's Google Calendar.", code: "google_conflict" }, 409);
  }
  const { data: d, error } = await admin.from("facility_blocks").update({ status: "approved", decided_by: staffId, decided_at: now, updated_at: now }).eq("id", b.id).eq("status", "pending").select("*").maybeSingle();
  if (isConflict(error)) return json({ error: "That time is already booked. Decline it or move the other block first.", code: "booked" }, 409);
  if (error) return bad("could not approve it", 500);
  if (!d) return bad("that request was already answered", 409);
  const mail = await tellRenter(req, cfg, d, renter, "approved");
  const google = await pushToGoogle();
  return json({ ok: true, status: "approved", renter_emailed: mail.sent, on_google: !!google?.pushed });
}

async function saveBlocks(staffId: string, body: Record<string, any>) {
  const kind = ["rental", "valor", "closed"].includes(body.kind) ? body.kind : "";
  if (!kind) return bad("pick who the block is for");
  let renter: Record<string, any> | null = null;
  if (kind === "rental") {
    const { data } = await admin.from("facility_renters").select("*").eq("id", String(body.renter_id || "")).is("archived_at", null).maybeSingle();
    if (!data) return bad("pick the renter");
    renter = data;
  }
  const slot = readSlot(body.date, body.start_min, body.end_min);
  if (!slot) return bad("pick a date, a start and an end");
  const space = kind === "rental" && body.space === "half" ? "half" : "full";
  const title = String(body.title || "").trim().slice(0, 80) || null;

  const dates: string[] = [];
  const days: number[] = Array.isArray(body.repeat?.days) ? body.repeat.days.map(Number).filter((n: number) => n >= 1 && n <= 7) : [];
  if (days.length) {
    if (!isYmd(body.repeat.until) || body.repeat.until < slot.date) return bad("pick the last day it repeats");
    const last = body.repeat.until > addDays(slot.date, 370) ? addDays(slot.date, 370) : body.repeat.until;
    for (let d = slot.date; d <= last; d = addDays(d, 1)) if (days.includes(weekdayOf(d))) dates.push(d);
    if (!dates.length) return bad("none of those weekdays fall between the two dates");
  } else dates.push(slot.date);

  const series_id = dates.length > 1 ? crypto.randomUUID() : null;
  const created: Record<string, any>[] = [], skipped: { date: string; reason: string }[] = [];
  for (const date of dates) {
    const { data, error } = await admin.from("facility_blocks").insert({
      kind, renter_id: renter?.id || null, title, space, starts_at: ptToUtc(date, slot.s).toISOString(), ends_at: ptToUtc(date, slot.e).toISOString(),
      status: "approved", series_id, created_by: staffId, decided_by: staffId, decided_at: new Date().toISOString(),
    }).select("id, starts_at, ends_at").single();
    if (isConflict(error)) skipped.push({ date, reason: "already booked" });
    else if (error) skipped.push({ date, reason: "could not save" });
    else created.push(data);
  }
  // heads-up only: a coach may put a block over a Google Calendar event on purpose
  let google_overlaps: string[] = [];
  if (created.length) {
    const { data: busy } = await admin.from("facility_gcal_busy").select("starts_at, ends_at").lt("starts_at", created[created.length - 1].ends_at).gt("ends_at", created[0].starts_at);
    google_overlaps = created.filter((c) => (busy || []).some((g) => g.starts_at < c.ends_at && g.ends_at > c.starts_at)).map((c) => partsPT(new Date(c.starts_at)).ymd);
  }
  const google = created.length ? await pushToGoogle() : null;
  return json({ ok: true, created: created.length, skipped, google_overlaps, google_left: google?.left || 0 });
}

/** The block plus, for scope "series", every later block made with it. */
async function targets(id: string, scope: string, statuses: string[]) {
  const { data: b } = await admin.from("facility_blocks").select("*, facility_renters(*)").eq("id", id).maybeSingle();
  if (!b || !statuses.includes(b.status)) return { b: null, list: [] as Record<string, any>[] };
  if (scope !== "series" || !b.series_id) return { b, list: [b] };
  const { data } = await admin.from("facility_blocks").select("*, facility_renters(*)").eq("series_id", b.series_id).in("status", statuses).gte("starts_at", b.starts_at).order("starts_at");
  return { b, list: data || [b] };
}

async function updateBlock(body: Record<string, any>) {
  const scope = body.scope === "series" ? "series" : "one";
  const { b, list } = await targets(String(body.id || ""), scope, ["approved", "pending"]);
  if (!b) return bad("block not found", 404);
  const s = Number(body.start_min), e = Number(body.end_min);
  if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || e > 1440 || e <= s) return bad("pick a start and an end");
  if (scope === "one" && body.date !== undefined && !isYmd(body.date)) return bad("that date doesn't look right");
  const space = b.kind === "rental" ? (body.space === "half" ? "half" : body.space === "full" ? "full" : b.space) : "full";
  const patch: Record<string, any> = { space, updated_at: new Date().toISOString() };
  if (body.title !== undefined) patch.title = String(body.title || "").trim().slice(0, 80) || null;
  let changed = 0;
  const skipped: { date: string; reason: string }[] = [];
  for (const t of list) {
    const date = scope === "one" && body.date ? body.date : partsPT(new Date(t.starts_at)).ymd;
    const { error } = await admin.from("facility_blocks").update({ ...patch, starts_at: ptToUtc(date, s).toISOString(), ends_at: ptToUtc(date, e).toISOString() }).eq("id", t.id);
    if (isConflict(error)) skipped.push({ date, reason: "already booked" });
    else if (error) skipped.push({ date, reason: "could not save" });
    else changed++;
  }
  if (changed) await pushToGoogle();
  return json({ ok: true, changed, skipped });
}

async function deleteBlock(req: Request, body: Record<string, any>) {
  const scope = body.scope === "series" ? "series" : "one";
  const { b, list } = await targets(String(body.id || ""), scope, ["approved", "pending"]);
  if (!b) return bad("block not found", 404);
  const now = new Date().toISOString();
  await admin.from("facility_blocks").update({ status: "canceled", updated_at: now }).in("id", list.map((t) => t.id));
  const lost = list.filter((t) => t.kind === "rental" && t.status === "approved" && t.ends_at > now);
  const mail = b.kind === "rental" && body.tell_renter !== false ? await tellRenterCanceled(req, b.facility_renters, lost) : { sent: false };
  await pushToGoogle();
  return json({ ok: true, removed: list.length, renter_emailed: mail.sent });
}

async function saveRenter(staffId: string, body: Record<string, any>) {
  const name = String(body.name || "").trim().slice(0, 80);
  if (!name) return bad("give the renter a name");
  const row: Record<string, any> = {
    name, contact_name: String(body.contact_name || "").trim().slice(0, 80) || null,
    contact_email: String(body.contact_email || "").trim().toLowerCase().slice(0, 120) || null,
    contact_phone: String(body.contact_phone || "").trim().slice(0, 30) || null,
  };
  if (body.is_example !== undefined) row.is_example = !!body.is_example;
  if (body.archived !== undefined) row.archived_at = body.archived ? new Date().toISOString() : null;
  const q = body.id
    ? admin.from("facility_renters").update(row).eq("id", String(body.id)).select("*").maybeSingle()
    : admin.from("facility_renters").insert({ ...row, created_by: staffId }).select("*").single();
  const { data, error } = await q;
  if (error || !data) return bad("could not save the renter", 500);
  return json({ ok: true, renter: data });
}

async function inviteMember(req: Request, body: Record<string, any>) {
  const email = String(body.email || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return bad("that email doesn't look right");
  const full_name = String(body.full_name || "").trim().slice(0, 80) || null;
  const { data: renter } = await admin.from("facility_renters").select("*").eq("id", String(body.renter_id || "")).is("archived_at", null).maybeSingle();
  if (!renter) return bad("renter not found", 404);
  const { data: staff } = await admin.from("staff_allowlist").select("email").ilike("email", email).limit(1);
  if (staff?.length) return bad("That email is a coach login. Coaches already see the whole calendar.", 409);
  const { data: prof } = await admin.from("profiles").select("id, role, full_name").eq("email", email).maybeSingle();
  if (prof?.role === "admin") return bad("That email is a coach login. Coaches already see the whole calendar.", 409);
  const origin = appUrl(req);

  let userId = prof?.id as string | undefined, link = "";
  if (!prof) {
    const { data, error } = await admin.auth.admin.generateLink({ type: "invite", email, options: { redirectTo: `${origin}/welcome`, data: { full_name, role: "renter" } } });
    if (error || !data.user?.id) return bad(error?.message || "could not make the login", 502);
    userId = data.user.id; link = data.properties?.action_link || "";
    // sign-up makes every new login a parent; a renter-only login gets its own role (no athlete screens)
    await admin.from("profiles").update({ role: "renter", full_name }).eq("id", userId).eq("role", "parent");
  }
  const { error: mErr } = await admin.from("facility_renter_members").upsert({ renter_id: renter.id, user_id: userId, email, full_name: full_name || prof?.full_name || null, invited_at: new Date().toISOString() });
  if (mErr) return bad("could not link the login", 500);

  const subject = `${renter.name}: Valor's rental calendar`;
  const hi = (full_name || "").split(/\s+/)[0];
  let emailed = false;
  if (mailConfigured() && !email.endsWith(".test") && !(renter.is_example && body.send_email === false)) {
    try {
      await sendMail({
        to: email, subject,
        text: `${hi ? `Hi ${hi}, ` : ""}Valor set you up to see when the floor is open and ask for a time. ${link ? `Set your password: ${link}` : `Sign in with your Valor login and tap Facility: ${origin}/facility`} Questions? Text 509-987-4612.`,
        html: wrapHtml("See what's open and ask for a time",
          `<p>${hi ? `Hi ${esc(hi)}, ` : ""}Valor set up <strong>${esc(renter.name)}</strong> on the facility calendar. You can see when the floor is open and ask for a time. A coach confirms every request.</p>
           ${link ? btn(link, "Set my password") : btn(`${origin}/facility`, "Open the calendar")}
           ${link ? "" : "<p>Sign in with the Valor login you already have, then tap Facility.</p>"}
           <p>Full turf and weight room is $125 an hour. Half the turf is $50 an hour. You pay Valor directly, nothing is charged in the app.</p>`,
          link ? "The link works once, for 24 hours. If it expires, ask a coach to send a new one." : ""),
      });
      emailed = true;
    } catch (e) { console.error("renter invite mail failed", (e as Error).message); }
  }
  // no email went out: hand the coach the link to text instead
  return json({ ok: true, emailed, existing_login: !!prof, link: emailed ? null : link || null });
}

async function removeMember(body: Record<string, any>) {
  await admin.from("facility_renter_members").delete().eq("renter_id", String(body.renter_id || "")).eq("user_id", String(body.user_id || ""));
  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  if (req.method === "GET" && url.pathname.endsWith("/gcal-callback")) {
    if (!gcal.gcalConfigured()) return bad("Google Calendar isn't set up", 503);
    let to: string;
    try { to = await gcal.handleCallback(url); } catch (e) { console.error("gcal callback", e); to = `${(Deno.env.get("APP_URL") || "https://app.valorsportsacademywa.com").replace(/\/$/, "")}/admin/facility?gcal=failed`; }
    return new Response(null, { status: 302, headers: { location: to } });
  }
  if (req.method !== "POST") return bad("POST only", 405);
  const user = await userFromRequest(req);
  if (!user) return bad("sign in first", 401);
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isStaff = prof?.role === "admin";
  let body: Record<string, any>;
  try { body = await req.json(); } catch { return bad("invalid json"); }
  try {
    switch (body.action) {
      case "calendar": return await calendar(user, isStaff, body);
      case "request": return await request(req, user, body);
      case "cancel": return await cancel(user, body);
    }
    if (!isStaff) return bad("staff only", 403);
    switch (body.action) {
      case "decide": return await decide(req, user.id, body);
      case "save_blocks": return await saveBlocks(user.id, body);
      case "update_block": return await updateBlock(body);
      case "delete_block": return await deleteBlock(req, body);
      case "save_renter": return await saveRenter(user.id, body);
      case "invite_member": return await inviteMember(req, body);
      case "remove_member": return await removeMember(body);
      case "gcal_connect":
        if (!gcal.gcalConfigured()) return json({ configured: false, redirect_uri: gcal.redirectUri() });
        return json({ configured: true, url: await gcal.connectUrl(user.id, appUrl(req), String(body.login_hint || "")) });
      case "gcal_disconnect": await gcal.disconnect(); return json({ ok: true });
      case "gcal_sync": {
        const row = await gcal.gcalRow();
        if (!gcal.isConnected(row)) return json({ connected: false });
        const today = partsPT(new Date()).ymd;
        const events = await gcal.refreshBusy(row!, ptToUtc(today, 0), ptToUtc(addDays(today, 90), 0));
        return json({ connected: true, events, ...(await gcal.syncOut(row!, 150)) });
      }
    }
    return bad("unknown action", 404);
  } catch (e) {
    console.error("facility failed", body?.action, e);
    return bad("server error", 500);
  }
});
