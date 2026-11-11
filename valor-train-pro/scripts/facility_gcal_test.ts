// Local test of the Google Calendar link against a stand-in Google server. Real database, throwaway rows, cleaned up.
const calls: { m: string; p: string; body?: any }[] = [];
let n = 0; const gone = new Set<string>();
const fakeJwt = "x." + btoa(JSON.stringify({ email: "valor-test@example.test" })) + ".y";
const server = Deno.serve({ port: 8787, onListen: () => {} }, async (req) => {
  const u = new URL(req.url); const body = req.method === "GET" || req.method === "DELETE" ? undefined : await req.text();
  const J = (o: unknown, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { "content-type": "application/json" } });
  if (u.pathname === "/token") { const f = new URLSearchParams(body); calls.push({ m: "TOKEN", p: f.get("grant_type")! }); return J(f.get("grant_type") === "authorization_code" ? { access_token: "a", expires_in: 3600, refresh_token: "r-secret", scope: "openid email https://www.googleapis.com/auth/calendar.events.owned", id_token: fakeJwt } : { access_token: "a", expires_in: 3600 }); }
  const id = decodeURIComponent(u.pathname.split("/events/")[1] || "");
  calls.push({ m: req.method, p: u.pathname, body: body ? JSON.parse(body) : undefined });
  if (req.method === "GET") return J({ items: [
    { id: "g1", summary: "Assessments", start: { dateTime: "2027-01-16T10:00:00-08:00" }, end: { dateTime: "2027-01-16T12:30:00-08:00" } },
    { id: "g2", summary: "All day thing", start: { date: "2027-01-16" }, end: { date: "2027-01-17" } },
    { id: "g3", summary: "Marked free", transparency: "transparent", start: { dateTime: "2027-01-16T13:00:00-08:00" }, end: { dateTime: "2027-01-16T14:00:00-08:00" } },
    { id: "g4", summary: "Rental: ours", extendedProperties: { private: { valorBlock: "abc" } }, start: { dateTime: "2027-01-16T15:00:00-08:00" }, end: { dateTime: "2027-01-16T16:00:00-08:00" } },
    { id: "g5", status: "cancelled", start: { dateTime: "2027-01-16T17:00:00-08:00" }, end: { dateTime: "2027-01-16T18:00:00-08:00" } },
  ] });
  if (req.method === "POST") return J({ id: "ev" + (++n) });
  if (req.method === "PATCH") return gone.has(id) ? J({ error: "gone" }, 404) : J({ id });
  if (req.method === "DELETE") return new Response(null, { status: 204 });
  return J({}, 400);
});
Deno.env.set("GOOGLE_CLIENT_ID", "cid"); Deno.env.set("GOOGLE_CLIENT_SECRET", "sec");
Deno.env.set("GOOGLE_CALENDAR_API", "http://localhost:8787"); Deno.env.set("GOOGLE_TOKEN_URL", "http://localhost:8787/token");
Deno.env.set("SUPABASE_URL", Deno.env.get("VALOR_TRAINPRO_SUPABASE_URL")!); Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", Deno.env.get("VALOR_TRAINPRO_SUPABASE_SERVICE_ROLE_KEY")!);
Deno.env.set("FACILITY_ENC_KEY", Deno.env.get("VALOR_TRAINPRO_FACILITY_ENC_KEY")!);
const gcal = await import("../supabase/functions/facility/gcal.ts");
const { admin } = await import("../supabase/functions/_shared/common.ts");
const fails: string[] = [];
const check = (name: string, ok: boolean, got?: unknown) => { console.log((ok ? "ok   " : "FAIL ") + name + (ok ? "" : "  -> " + JSON.stringify(got)?.slice(0, 300))); if (!ok) fails.push(name); };
const clean = async () => {
  await admin.from("facility_blocks").delete().like("title", "ZZSYNC%");
  await admin.from("facility_blocks").delete().eq("note", "ZZSYNC");
  await admin.from("facility_gcal_busy").delete().in("event_id", ["g1", "g2", "g3", "g4", "g5"]);
  await admin.from("facility_gcal").delete().eq("id", 1);
  await admin.from("facility_blocks").update({ gcal_event_id: null, gcal_synced_at: null }).like("gcal_event_id", "ev%"); // ids from the stand-in server
};
try {
  await clean();
  const { data: staff } = await admin.from("profiles").select("id").eq("email", "vtp-fac-staff@valortrainpro.test").single();
  const { data: parent } = await admin.from("profiles").select("id").eq("role", "parent").limit(1).single();
  const { data: ex } = await admin.from("facility_renters").select("id").eq("name", "ZZ Test Maniacs").single();
  // connect
  const url = await gcal.connectUrl(staff!.id, "http://localhost:5188", "valor@example.test");
  const q = new URL(url).searchParams;
  check("connect link asks for the calendar scope, offline access and the right return address", q.get("scope")!.includes("calendar.events.owned") && q.get("access_type") === "offline" && q.get("redirect_uri")!.endsWith("/functions/v1/facility/gcal-callback") && q.get("login_hint") === "valor@example.test", url);
  const cb = (state: string, extra = "code=abc") => gcal.handleCallback(new URL("http://x/functions/v1/facility/gcal-callback?" + extra + "&state=" + encodeURIComponent(state)));
  check("a tampered connect link is refused", (await cb(q.get("state")! + "x")).endsWith("gcal=expired"));
  check("a link made by a non-coach is refused", (await cb(new URL(await gcal.connectUrl(parent!.id, "http://localhost:5188")).searchParams.get("state")!)).endsWith("gcal=failed"));
  check("declining on Google's screen is reported", (await cb(q.get("state")!, "error=access_denied")).endsWith("gcal=declined"));
  const back = await cb(q.get("state")!);
  let row = await gcal.gcalRow();
  check("connect stores the account and sends the coach back to the app", back === "http://localhost:5188/admin/facility?gcal=connected" && row?.email === "valor-test@example.test" && gcal.isConnected(row), { back, row });
  check("the refresh token is stored encrypted, not in the clear", !!row?.refresh_token_enc && !row.refresh_token_enc.includes("r-secret"), row?.refresh_token_enc?.slice(0, 12));
  // in: what is on Google blocks the floor
  const cnt = await gcal.refreshBusy(row!, new Date("2027-01-16T08:00:00Z"), new Date("2027-01-17T08:00:00Z"));
  const { data: busy } = await admin.from("facility_gcal_busy").select("event_id, title").in("event_id", ["g1", "g2", "g3", "g4", "g5"]);
  check("only the timed, busy, not-ours event is cached (all-day, Free, cancelled and our own are skipped)", cnt === 1 && busy?.length === 1 && busy[0].event_id === "g1", busy);
  const free = async (g: boolean) => (await admin.rpc("facility_units_free", { p_start: "2027-01-16T10:00:00-08:00", p_end: "2027-01-16T11:00:00-08:00", p_exclude: null, p_gcal: g })).data;
  check("that event blocks the floor when Google is counted", (await free(true)) === 0 && (await free(false)) === 2, [await free(true), await free(false)]);
  // out: approved blocks become events
  calls.length = 0;
  const mk = (o: Record<string, unknown>) => admin.from("facility_blocks").insert(o).select("*").single();
  const { data: A } = await mk({ kind: "valor", title: "ZZSYNC Evening class", starts_at: "2027-01-12T16:00:00-08:00", ends_at: "2027-01-12T18:00:00-08:00" });
  const { data: X } = await mk({ kind: "rental", renter_id: ex!.id, space: "half", note: "ZZSYNC", starts_at: "2027-01-12T19:00:00-08:00", ends_at: "2027-01-12T20:00:00-08:00" });
  let r = await gcal.syncOut(row!);
  const post = calls.find((c) => c.m === "POST" && c.body.extendedProperties.private.valorBlock === A!.id);
  const { data: A1 } = await admin.from("facility_blocks").select("gcal_event_id, gcal_synced_at").eq("id", A!.id).single();
  check("a new approved block is written to Google once, a test renter's block is not", r.failed === 0 && calls.filter((c) => c.m === "POST" && c.body.extendedProperties.private.valorBlock === A!.id).length === 1 && !calls.some((c) => c.body?.extendedProperties?.private?.valorBlock === X!.id) && /^ev\d+$/.test(A1?.gcal_event_id || ""), { r, id: A1?.gcal_event_id });
  const evA = A1!.gcal_event_id as string;
  check("the event has the title, Pacific times and the app's marker", post?.body.summary === "ZZSYNC Evening class" && post.body.start.dateTime === "2027-01-13T00:00:00.000Z" && post.body.start.timeZone === "America/Los_Angeles" && post.body.extendedProperties.private.valorBlock === A!.id, post?.body);
  check("rental title reads like the mockup", gcal.eventTitle({ kind: "rental", space: "full" }, "Maniacs") === "Rental: Maniacs, full turf" && gcal.eventTitle({ kind: "rental", space: "half" }, "Tri-City FC") === "Rental: Tri-City FC, half turf" && gcal.eventTitle({ kind: "closed", title: "Holiday" }, null) === "Closed: Holiday");
  calls.length = 0; r = await gcal.syncOut(row!);
  check("nothing is sent again when nothing changed", r.pushed === 0 && r.removed === 0 && calls.filter((c) => c.m !== "TOKEN").length === 0, { r, calls });
  await admin.from("facility_blocks").update({ title: "ZZSYNC Evening class moved", ends_at: "2027-01-12T18:30:00-08:00", updated_at: new Date(Date.now() + 1000).toISOString() }).eq("id", A!.id);
  calls.length = 0; r = await gcal.syncOut(row!);
  check("an edit in the app updates the same Google event", r.pushed === 1 && calls.some((c) => c.m === "PATCH" && c.p.endsWith("/events/" + evA) && c.body.summary.endsWith("moved")), calls.map((c) => [c.m, c.p]));
  gone.add(evA);
  await admin.from("facility_blocks").update({ updated_at: new Date(Date.now() + 5000).toISOString() }).eq("id", A!.id);
  calls.length = 0; r = await gcal.syncOut(row!);
  const { data: A2 } = await admin.from("facility_blocks").select("gcal_event_id").eq("id", A!.id).single();
  check("an event someone deleted in Google is put back", r.pushed === 1 && calls.some((c) => c.m === "POST") && !!A2?.gcal_event_id && A2.gcal_event_id !== evA, { r, id: A2?.gcal_event_id });
  await admin.from("facility_blocks").update({ status: "canceled", updated_at: new Date().toISOString() }).eq("id", A!.id);
  calls.length = 0; r = await gcal.syncOut(row!);
  const { data: A3 } = await admin.from("facility_blocks").select("gcal_event_id").eq("id", A!.id).single();
  check("removing the block in the app removes the Google event", r.removed === 1 && calls.some((c) => c.m === "DELETE" && c.p.endsWith("/events/" + A2!.gcal_event_id)) && A3?.gcal_event_id === null, { r, calls: calls.map((c) => [c.m, c.p]) });
  await gcal.disconnect(); row = await gcal.gcalRow();
  check("disconnect drops the token and the cached Google events", !gcal.isConnected(row) && !(await admin.from("facility_gcal_busy").select("event_id").eq("event_id", "g1")).data?.length, row);
  void X;
} finally {
  await clean();
  const { data: left } = await admin.from("facility_gcal").select("id");
  console.log("left behind: google rows", left?.length, fails.length ? "\nFAILED: " + fails.join(" | ") : "\nALL PASSED");
  await server.shutdown();
}
