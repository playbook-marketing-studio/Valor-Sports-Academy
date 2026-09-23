// ════════════════════════════════════════════════════════════════════════
// Edge Function · ingest-booking  (Valor Train Pro)
// The site's booking function (Playbook project, `assessment-booking`) POSTs every
// book / request / reschedule / cancel / status change here, so staff see the
// Saturday list in the app without anyone re-typing it.
//   POST  header x-ingest-key: <INGEST_KEY>   body {booking: {...site row}}  or  {bookings: [...]}
// Upserts on source_booking_id. First time a booking arrives it also creates the
// athlete (no parent login yet; parent contact kept on the athlete row).
// Deploy: supabase functions deploy ingest-booking --no-verify-jwt --project-ref gpotwyuttkkygvxzktep --use-api
// ════════════════════════════════════════════════════════════════════════
import { admin, bad, cors, json } from "../_shared/common.ts";

const STATUS: Record<string, string> = {
  booked: "booked", rescheduled: "booked", requested: "requested", canceled: "canceled",
  attended: "attended", "no-show": "no_show", no_show: "no_show",
};
const str = (v: unknown, max = 200) => (typeof v === "string" && v.trim() ? v.trim().slice(0, max) : null);

async function ingestOne(src: Record<string, unknown>) {
  const sid = str(src.id, 60);
  if (!sid) return { error: "missing id" };
  const email = (str(src.email) || "").toLowerCase();
  const full = str(src.athlete_name, 120) || "";
  const [first, ...rest] = full.split(/\s+/);
  const age = parseInt(String(src.athlete_age ?? ""), 10);
  const incoming = STATUS[String(src.status || "")] || "booked";

  const { data: existing } = await admin.from("bookings").select("id, status, athlete_id, parent_id").eq("source_booking_id", sid).maybeSingle();

  const row: Record<string, unknown> = {
    source_booking_id: sid,
    origin: "site",
    athlete_first_name: first || "Athlete",
    athlete_last_name: rest.join(" ") || null,
    athlete_age: Number.isFinite(age) && age > 0 && age < 99 ? age : null,
    sport: str(src.sport, 80),
    quiz_result: str(src.quiz_result, 80),
    parent_name: str(src.parent_name, 120) || email || "Parent",
    parent_email: email,
    parent_phone: str(src.phone, 40),
    slot_start: str(src.slot_start, 40),
    slot_end: str(src.slot_end, 40),
    requested_day: str(src.requested_day, 10),
    requested_window: str(src.requested_window, 60),
    requested_note: str(src.note, 500),
    source: str(src.utm_source, 80),
    utm: {
      utm_source: str(src.utm_source), utm_medium: str(src.utm_medium), utm_campaign: str(src.utm_campaign),
      utm_content: str(src.utm_content), fbclid: str(src.fbclid, 300), gclid: str(src.gclid, 300),
    },
    amount_cents: 0,
  };
  // keep what staff recorded at the door; the site only knows booked/rescheduled/canceled
  const staffSet = existing && ["attended", "no_show"].includes(existing.status);
  if (!(staffSet && incoming === "booked")) row.status = incoming;

  if (existing) {
    // reschedule / cancel payloads may not carry attribution again; never blank what we already have
    const patch = { ...row };
    if (!row.source) delete patch.source;
    if (!Object.values(row.utm as Record<string, unknown>).some(Boolean)) delete patch.utm;
    const { error } = await admin.from("bookings").update(patch).eq("id", existing.id);
    if (error) return { error: error.message };
    return { id: existing.id, updated: true };
  }

  // first sighting: find or create the athlete under this parent email
  const { data: parent } = email
    ? await admin.from("profiles").select("id").ilike("email", email).eq("role", "parent").maybeSingle()
    : { data: null };
  let athleteId: string | null = null;
  if (email) {
    const { data: a } = await admin.from("athletes").select("id").ilike("parent_email", email)
      .ilike("first_name", String(row.athlete_first_name)).limit(1).maybeSingle();
    athleteId = a?.id ?? null;
  }
  if (!athleteId) {
    const { data: a, error } = await admin.from("athletes").insert({
      parent_id: parent?.id ?? null,
      first_name: row.athlete_first_name, last_name: row.athlete_last_name, age: row.athlete_age, sport: row.sport,
      parent_name: row.parent_name, parent_email: email || null, parent_phone: row.parent_phone,
    }).select("id").single();
    if (error) return { error: error.message };
    athleteId = a.id;
  }
  const { data: b, error } = await admin.from("bookings")
    .insert({ ...row, status: row.status ?? incoming, athlete_id: athleteId, parent_id: parent?.id ?? null })
    .select("id").single();
  if (error) {
    // two active bookings on one slot can only happen if the site allowed it; keep the row without the slot
    if (error.code === "23505") {
      const retry = await admin.from("bookings").insert({ ...row, status: row.status ?? incoming, athlete_id: athleteId, parent_id: parent?.id ?? null, notes: `Slot clash on import: ${row.slot_start}`, slot_start: null, slot_end: null }).select("id").single();
      if (retry.error) return { error: retry.error.message };
      return { id: retry.data.id, created: true, clash: true };
    }
    return { error: error.message };
  }
  return { id: b.id, created: true, athlete_id: athleteId };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return bad("POST only", 405);
  const key = Deno.env.get("INGEST_KEY");
  if (!key || req.headers.get("x-ingest-key") !== key) return bad("unauthorized", 401);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad("invalid json"); }
  const list = Array.isArray(body.bookings) ? body.bookings : body.booking ? [body.booking] : [];
  if (!list.length) return bad("no booking");
  const results = [];
  for (const b of list.slice(0, 500)) {
    try { results.push(await ingestOne(b as Record<string, unknown>)); }
    catch (e) { console.error(e); results.push({ error: String(e) }); }
  }
  return json({ ok: true, results });
});
