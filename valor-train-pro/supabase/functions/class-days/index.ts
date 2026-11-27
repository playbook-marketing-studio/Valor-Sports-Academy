// ════════════════════════════════════════════════════════════════════════
// Edge Function · class-days  (Valor Train Pro) — a family picks which days (and time) their athlete comes
// (Corey 11/24/2026, Omar 11/27). Writes athletes.class_days in the format staff already use, "Mon / Wed (PM1)",
// so the athlete page, the roster and the coaches' "Coming today" list all read the same field.
// Service role on purpose: athletes_parent_guard only lets a family change the basics, and this is the one
// other field a family may set, validated here against settings.class_schedule.
//   POST {athlete_id, days:["Mon","Wed"], slot:"PM1"}
// Deploy: supabase functions deploy class-days --no-verify-jwt --project-ref gpotwyuttkkygvxzktep --use-api
// ════════════════════════════════════════════════════════════════════════
import { admin, bad, cors, json, userFromRequest } from "../_shared/common.ts";

const DEFAULT = { days: ["Mon", "Tues", "Wed", "Thurs", "Fri"], slots: [{ key: "AM" }, { key: "PM1" }, { key: "PM2" }, { key: "PM3" }] };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return bad("POST only", 405);
  const user = await userFromRequest(req);
  if (!user) return bad("sign in first", 401);
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return bad("invalid json"); }
  try {
    const { data: a } = await admin.from("athletes").select("id, parent_id, user_id, archived_at").eq("id", String(body.athlete_id || "")).maybeSingle();
    if (!a || a.archived_at || (a.parent_id !== user.id && a.user_id !== user.id)) return bad("not your athlete", 403);
    const { data: st } = await admin.from("settings").select("value").eq("key", "class_schedule").maybeSingle();
    const sched = st?.value && Array.isArray(st.value.days) && Array.isArray(st.value.slots) && st.value.slots.length ? st.value : DEFAULT;
    const want = Array.isArray(body.days) ? body.days.map(String) : [];
    const days = sched.days.filter((d: string) => want.includes(d)); // keeps the week's order, drops anything unknown
    if (!days.length) return bad("pick at least one day");
    if (days.length !== new Set(want).size) return bad("pick from the days on the schedule");
    const slot = String(body.slot || "");
    if (!sched.slots.some((s: { key: string }) => s.key === slot)) return bad("pick a class time");
    const class_days = `${days.join(" / ")} (${slot})`;
    const { error } = await admin.from("athletes").update({ class_days }).eq("id", a.id);
    if (error) return bad(error.message, 500);
    return json({ class_days });
  } catch (e) {
    console.error(e);
    return bad("server error", 500);
  }
});
