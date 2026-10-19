// Email alerts (10/19/2026, Omar: "a message alert or an in app alert would be ideal; by message i mean email").
//   coach message      -> the parent's login email (body included, button into the app)
//   parent reply       -> every coach (staff_allowlist, minus *.test), same list the site's booking alerts use
//   announcement       -> every family with a login (BCC), only when the coach leaves "Also email" on
//   card payment paid  -> every coach;  refund -> every coach
// The "Live example" athlete (Test Omar) only ever emails Omar, so testing never reaches Corey, Michael or families.
// Each alert sends once: message_alerts(key) is claimed before sending.
import { admin } from "./common.ts";
import { btn, esc, mailConfigured, quote, sendMail, valorInbox, wrapHtml, type Mail } from "./mail.ts";

const TEST_ONLY = "omar@playbookmarketing.studio";
const THROTTLE_MIN = 10; // a burst of messages in one thread sends one email
const appUrl = () => (Deno.env.get("APP_URL") || "https://app.valorsportsacademywa.com").replace(/\/$/, "");
const money = (cents: number) => `$${(cents / 100).toFixed(2)}`;
const first = (name?: string | null) => (name || "").trim().split(/\s+/)[0] || "";
const fullName = (a: any) => [a?.first_name, a?.last_name].filter(Boolean).join(" ") || "your athlete";

export type AlertResult = { sent: boolean; reason?: string; to?: string[]; bcc?: number; subject?: string; html?: string };

async function staffRecipients(isExample: boolean): Promise<string[]> {
  if (isExample) return [TEST_ONLY];
  const { data } = await admin.from("staff_allowlist").select("email");
  return [...new Set((data || []).map((r) => String(r.email).toLowerCase()).filter((e) => e && !e.endsWith(".test")))];
}

/** Claim an alert key; false if it was already sent. */
async function claim(key: string) {
  const { data, error } = await admin.from("message_alerts").insert({ key }).select("key");
  if (error?.code === "23505") return false; // duplicate key = already sent
  if (error) throw error;
  return !!data?.length;
}

async function deliver(key: string, mail: Mail, dryRun: boolean): Promise<AlertResult> {
  const to = Array.isArray(mail.to) ? mail.to : [mail.to];
  if (dryRun) return { sent: false, reason: "dry run", to, bcc: mail.bcc?.length || 0, subject: mail.subject, html: mail.html };
  if (!mailConfigured()) return { sent: false, reason: "email not configured" };
  if (!(await claim(key))) return { sent: false, reason: "already sent" };
  try {
    await sendMail(mail);
  } catch (e) {
    await admin.from("message_alerts").delete().eq("key", key); // let a retry try again
    throw e;
  }
  return { sent: true, to, bcc: mail.bcc?.length || 0, subject: mail.subject };
}

/** `msg` is a message id, or (dry run only) an unsaved message object to preview. */
export async function alertForMessage(msg: string | Record<string, any>, opts: { emailFamilies?: boolean; dryRun?: boolean } = {}): Promise<AlertResult> {
  const m = typeof msg === "string" ? (await admin.from("messages").select("*").eq("id", msg).maybeSingle()).data : (opts.dryRun ? msg : null);
  if (!m) return { sent: false, reason: "no such message" };

  if (m.kind === "announcement") {
    if (!m.from_staff || !opts.emailFamilies) return { sent: false, reason: "not emailed" };
    const { data: kids } = await admin.from("athletes").select("parent_id, is_example").not("parent_id", "is", null).is("archived_at", null);
    const ids = [...new Set((kids || []).map((k) => k.parent_id))];
    const { data: parents } = ids.length ? await admin.from("profiles").select("email").in("id", ids) : { data: [] };
    const bcc = [...new Set((parents || []).map((p) => p.email).filter(Boolean))] as string[];
    if (!bcc.length) return { sent: false, reason: "no families with a login" };
    const title = m.title || "News from Valor";
    return deliver(`msg:${m.id}`, {
      to: valorInbox(), bcc, subject: title,
      text: `${title}. ${m.body} Open the app: ${appUrl()}/messages`,
      html: wrapHtml(title, `${quote(m.body)}${btn(`${appUrl()}/messages`, "Open the Valor app")}`, "You're getting this because your athlete trains at Valor Sports Academy."),
    }, !!opts.dryRun);
  }

  // direct thread
  const { data: a } = await admin.from("athletes").select("id, first_name, last_name, parent_id, parent_name, is_example").eq("id", m.athlete_id).maybeSingle();
  if (!a) return { sent: false, reason: "no athlete" };
  const since = new Date(new Date(m.created_at).getTime() - THROTTLE_MIN * 60000).toISOString();
  const { count } = await admin.from("messages").select("id", { count: "exact", head: true })
    .eq("kind", "direct").eq("athlete_id", m.athlete_id).eq("from_staff", m.from_staff)
    .gte("created_at", since).lt("created_at", m.created_at);
  if ((count || 0) > 0) return { sent: false, reason: `throttled: same side wrote in the last ${THROTTLE_MIN} min` };

  if (m.from_staff) {
    if (!a.parent_id) return { sent: false, reason: "parent has no login" };
    const { data: p } = await admin.from("profiles").select("email, full_name").eq("id", a.parent_id).maybeSingle();
    if (!p?.email) return { sent: false, reason: "parent has no email" };
    const hi = first(p.full_name || a.parent_name);
    const subject = `New message from Valor about ${a.first_name || "your athlete"}`;
    return deliver(`msg:${m.id}`, {
      to: p.email, subject,
      text: `${hi ? `Hi ${hi}, ` : ""}Valor sent you a message about ${a.first_name}: ${m.body} Reply in the app: ${appUrl()}/messages`,
      html: wrapHtml(subject, `<p>${hi ? `Hi ${esc(hi)}, the` : "The"} coaches sent you a message about ${esc(a.first_name)}:</p>${quote(m.body)}${btn(`${appUrl()}/messages`, "Reply in the app")}`,
        "Reply in the app so every coach sees it."),
    }, !!opts.dryRun);
  }

  const to = await staffRecipients(!!a.is_example);
  const who = a.parent_name || "A parent";
  const subject = `${who} sent a message about ${fullName(a)}`;
  return deliver(`msg:${m.id}`, {
    to, subject,
    text: `${who} wrote about ${fullName(a)}: ${m.body} Reply in the app: ${appUrl()}/admin/messages/${a.id}`,
    html: wrapHtml(subject, `${quote(m.body)}${btn(`${appUrl()}/admin/messages/${a.id}`, "Reply in the app")}`,
      "Every coach gets this email. Whoever replies first, the family sees it in the app."),
  }, !!opts.dryRun);
}

export async function alertForPayment(paymentId: string, kind: "paid" | "refunded", opts: { dryRun?: boolean } = {}): Promise<AlertResult> {
  const { data: pay } = await admin.from("payments").select("*").eq("id", paymentId).maybeSingle();
  if (!pay) return { sent: false, reason: "no such payment" };
  if (kind === "paid" && (pay.status !== "paid" || pay.method !== "card")) return { sent: false, reason: "only online card payments alert" };
  if (kind === "refunded" && pay.status !== "refunded") return { sent: false, reason: "not refunded" };
  const { data: a } = await admin.from("athletes").select("id, first_name, last_name, parent_name, is_example").eq("id", pay.athlete_id).maybeSingle();
  const to = await staffRecipients(!!a?.is_example);
  const item = String(pay.description || pay.plan_key || "Class pack").split(" · ")[0];
  const amount = money(pay.amount_cents || 0);
  const subject = kind === "paid"
    ? `Payment: ${amount} for ${fullName(a)}${a?.parent_name ? ` from ${a.parent_name}` : ""}`
    : `Refund: ${amount} for ${fullName(a)}`;
  const lines = kind === "paid"
    ? `<p><strong>${esc(amount)}</strong> paid by card for <strong>${esc(item)}</strong>.</p><p>${esc(fullName(a))}'s workouts, nutrition and training plan are unlocked.</p>`
    : `<p>${esc(amount)} for <strong>${esc(item)}</strong> was refunded in Stripe.</p><p>If that was their only active pack, ${esc(a?.first_name || "the athlete")} is locked out of workouts and nutrition until they buy again.</p>`;
  return deliver(`pay:${pay.id}:${kind}`, {
    to, subject,
    text: `${subject}. ${item}. Athlete page: ${appUrl()}/admin/athletes/${pay.athlete_id}`,
    html: wrapHtml(subject, `${lines}${btn(`${appUrl()}/admin/athletes/${pay.athlete_id}`, "Open athlete page")}`),
  }, !!opts.dryRun);
}
