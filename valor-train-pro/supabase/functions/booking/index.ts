// ════════════════════════════════════════════════════════════════════════
// Edge Function · booking  (Valor Train Pro)
// Public form -> onboarding -> payment choice for the athlete assessment.
//   GET  ?action=slots                         → slot config + taken slot starts
//   GET  ?action=get&id=<booking>&t=<claim>    → booking summary (claim-token gated)
//   POST {action:"create", ...form}            → insert booking (booked or requested) → {id, claim_token, ...}
//   POST {action:"claim", id, t}  + user JWT   → attach booking to the signed-in parent, create the athlete row
//   POST {action:"choose", id, t, payment_method:"in_person"}  → pay at the assessment
// Deploy: supabase functions deploy booking --no-verify-jwt --project-ref gpotwyuttkkygvxzktep
// ════════════════════════════════════════════════════════════════════════
import { admin, appOrigin, assessmentSettings, authorizedBooking, bad, cors, json, publicBooking, userFromRequest } from "../_shared/common.ts";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const clean = (v: unknown, max = 200) => (typeof v === "string" ? v.trim().slice(0, max) : "");

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const url = new URL(req.url);
  let body: Record<string, unknown> = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { return bad("invalid json"); }
  }
  const action = String(url.searchParams.get("action") || body.action || "");

  try {
    // ── slots ───────────────────────────────────────────────────────────
    if (action === "slots") {
      const cfg = await assessmentSettings();
      const { data } = await admin.from("bookings").select("slot_start")
        .in("status", ["booked", "attended"]).not("slot_start", "is", null).gte("slot_start", new Date().toISOString());
      return json({ config: cfg, taken: (data || []).map((r) => r.slot_start) });
    }

    // ── get ─────────────────────────────────────────────────────────────
    if (action === "get") {
      const id = url.searchParams.get("id") || String(body.id || "");
      const t = url.searchParams.get("t") || String(body.t || "");
      const { booking, reason } = await authorizedBooking(req, id, t);
      if (!booking) return bad(reason || "not allowed", 404);
      const cfg = await assessmentSettings();
      return json({ booking: publicBooking(booking), config: cfg, stripe_configured: !!Deno.env.get("STRIPE_SECRET_KEY") });
    }

    // ── create ──────────────────────────────────────────────────────────
    if (action === "create") {
      const cfg = await assessmentSettings();
      const athlete_first_name = clean(body.athlete_first_name, 80);
      const parent_name = clean(body.parent_name, 120);
      const parent_email = clean(body.parent_email, 200).toLowerCase();
      if (!athlete_first_name) return bad("athlete first name is required");
      if (!parent_name) return bad("parent name is required");
      if (!EMAIL_RE.test(parent_email)) return bad("a valid parent email is required");
      const age = Number(body.athlete_age);
      const slot = clean(body.slot_start, 40);
      const requested_note = clean(body.requested_note, 500);
      if (!slot && !requested_note) return bad("pick a time or tell us when works");

      let slot_start: string | null = null, slot_end: string | null = null;
      if (slot) {
        const d = new Date(slot);
        if (isNaN(d.getTime())) return bad("bad slot");
        if (d.getTime() < Date.now()) return bad("that time has already passed");
        slot_start = d.toISOString();
        slot_end = new Date(d.getTime() + cfg.slot_min * 60_000).toISOString();
      }
      const row = {
        athlete_first_name,
        athlete_last_name: clean(body.athlete_last_name, 80) || null,
        athlete_age: Number.isFinite(age) && age > 0 && age < 30 ? age : null,
        sport: clean(body.sport, 80) || null,
        parent_name, parent_email,
        parent_phone: clean(body.parent_phone, 40) || null,
        how_heard: clean(body.how_heard, 120) || null,
        notes: clean(body.notes, 1000) || null,
        slot_start, slot_end,
        requested_note: requested_note || null,
        status: slot_start ? "booked" : "requested",
        amount_cents: cfg.fee_cents, currency: cfg.currency,
        source: clean(body.source, 80) || null,
        utm: body.utm && typeof body.utm === "object" ? body.utm : null,
      };
      const { data, error } = await admin.from("bookings").insert(row).select("*").single();
      if (error) {
        if (error.code === "23505") return bad("that time just filled, pick another", 409);
        console.error("create failed", error);
        return bad("could not save the booking", 500);
      }
      return json({ booking: data, claim_token: data.claim_token, app: appOrigin(req) });
    }

    // ── claim (needs the signed-in parent) ──────────────────────────────
    if (action === "claim") {
      const id = String(body.id || ""), t = String(body.t || "");
      const user = await userFromRequest(req);
      if (!user) return bad("sign in first", 401);
      const { booking, reason } = await authorizedBooking(req, id, t);
      if (!booking) return bad(reason || "not allowed", 403);
      if (booking.parent_id && booking.parent_id !== user.id) return bad("this booking belongs to another account", 403);

      // keep the parent's profile filled in
      const { data: prof } = await admin.from("profiles").select("*").eq("id", user.id).maybeSingle();
      if (prof) {
        const patch: Record<string, unknown> = {};
        if (!prof.full_name && booking.parent_name) patch.full_name = booking.parent_name;
        if (!prof.phone && booking.parent_phone) patch.phone = booking.parent_phone;
        if (Object.keys(patch).length) await admin.from("profiles").update(patch).eq("id", user.id);
      }

      // athlete row: reuse a same-named athlete under this parent, else create
      let athleteId = booking.athlete_id as string | null;
      if (!athleteId) {
        const { data: existing } = await admin.from("athletes").select("id")
          .eq("parent_id", user.id).ilike("first_name", booking.athlete_first_name)
          .limit(1).maybeSingle();
        if (existing) athleteId = existing.id;
        else {
          const { data: a, error: aErr } = await admin.from("athletes").insert({
            parent_id: user.id,
            first_name: booking.athlete_first_name,
            last_name: booking.athlete_last_name,
            age: booking.athlete_age,
            sport: booking.sport,
          }).select("id").single();
          if (aErr) { console.error(aErr); return bad("could not create the athlete", 500); }
          athleteId = a.id;
        }
      }
      const { data: updated, error } = await admin.from("bookings")
        .update({ parent_id: user.id, athlete_id: athleteId }).eq("id", id).select("*").single();
      if (error) return bad("could not link the booking", 500);
      return json({ booking: publicBooking(updated), stripe_configured: !!Deno.env.get("STRIPE_SECRET_KEY") });
    }

    // ── choose in-person ────────────────────────────────────────────────
    if (action === "choose") {
      const id = String(body.id || ""), t = String(body.t || "");
      const method = String(body.payment_method || "");
      if (method !== "in_person") return bad("use stripe-checkout for online payment");
      const { booking, reason } = await authorizedBooking(req, id, t);
      if (!booking) return bad(reason || "not allowed", 403);
      if (booking.payment_status === "paid") return json({ booking: publicBooking(booking) });
      const { data, error } = await admin.from("bookings")
        .update({ payment_method: "in_person", payment_status: "unpaid", stripe_checkout_session_id: null })
        .eq("id", id).select("*").single();
      if (error) return bad("could not update", 500);
      return json({ booking: publicBooking(data) });
    }

    return bad("unknown action", 404);
  } catch (e) {
    console.error(e);
    return bad("server error", 500);
  }
});
