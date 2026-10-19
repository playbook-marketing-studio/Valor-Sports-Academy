// ════════════════════════════════════════════════════════════════════════
// Edge Function · notify  (Valor Train Pro)  — email alerts, see _shared/alerts.ts
//   POST {message_id, email_families?}  signed-in sender of that message, within 10 min of sending
//   POST {payment_id, kind, dry_run}    staff only (testing); stripe-webhook calls alertForPayment directly
//   dry_run: true (staff only)          returns recipients + subject + html, sends nothing
//   {dry_run, preview: {kind:'announcement', title, body}}  staff preview of an unsaved announcement email
// Deploy: supabase functions deploy notify --project-ref gpotwyuttkkygvxzktep --use-api
// ════════════════════════════════════════════════════════════════════════
import { admin, bad, cors, json, userFromRequest } from "../_shared/common.ts";
import { alertForMessage, alertForPayment } from "../_shared/alerts.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return bad("POST only", 405);
  const user = await userFromRequest(req);
  if (!user) return bad("sign in first", 401);
  const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  const isStaff = prof?.role === "admin";
  let body: Record<string, any> = {};
  try { body = await req.json(); } catch { /* empty */ }
  const dryRun = !!body.dry_run;
  if (dryRun && !isStaff) return bad("staff only", 403);

  try {
    if (body.payment_id) {
      if (!isStaff) return bad("staff only", 403);
      return json(await alertForPayment(String(body.payment_id), body.kind === "refunded" ? "refunded" : "paid", { dryRun }));
    }
    if (dryRun && body.preview?.kind === "announcement") {
      const p = body.preview;
      return json(await alertForMessage({ id: "preview", kind: "announcement", from_staff: true, title: p.title || null, body: String(p.body || "") }, { emailFamilies: true, dryRun }));
    }
    if (!body.message_id) return bad("message_id required");
    const { data: m } = await admin.from("messages").select("id, sender_id, created_at").eq("id", body.message_id).maybeSingle();
    if (!m) return bad("no such message", 404);
    if (!dryRun) {
      if (m.sender_id !== user.id) return bad("not your message", 403);
      if (Date.now() - new Date(m.created_at).getTime() > 10 * 60000) return bad("too old to alert", 409);
    }
    return json(await alertForMessage(m.id, { emailFamilies: isStaff && body.email_families !== false, dryRun }));
  } catch (e) {
    console.error("notify failed", e);
    return bad("could not send the email", 500);
  }
});
