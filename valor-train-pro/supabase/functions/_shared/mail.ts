// Email from Valor's Gmail (SMTP 465), same sender as the site's booking emails.
// Secrets: VALOR_GMAIL_USER, VALOR_GMAIL_APP_PASSWORD (vault playbook/.env has the same pair).
// Every MIME part goes out base64 built here: denomailer 1.6's quoted-printable path turned
// "=" and trailing spaces into garbage on the site's emails (9/24/2026).
import { SMTPClient } from "https://deno.land/x/denomailer@1.6.0/mod.ts";

export const VALOR = {
  name: "Valor Sports Academy",
  phone: "509-987-4612",
  tel: "+15099874612",
};

export type Mail = { to: string | string[]; bcc?: string[]; subject: string; text: string; html: string };

function base64Utf8(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}
const b64Lines = (s: string) => base64Utf8(s).replace(/.{76}/g, "$&\r\n");

export const mailConfigured = () => !!(Deno.env.get("VALOR_GMAIL_USER") && Deno.env.get("VALOR_GMAIL_APP_PASSWORD"));
export const valorInbox = () => Deno.env.get("VALOR_GMAIL_USER") || "";

export async function sendMail(m: Mail) {
  const user = Deno.env.get("VALOR_GMAIL_USER")!;
  const pass = (Deno.env.get("VALOR_GMAIL_APP_PASSWORD") || "").replace(/\s+/g, "");
  const client = new SMTPClient({ connection: { hostname: "smtp.gmail.com", port: 465, tls: true, auth: { username: user, password: pass } } });
  const msg: Record<string, unknown> = {
    from: `${VALOR.name} <${user}>`,
    to: m.to,
    replyTo: user,
    subject: m.subject,
    mimeContent: [
      // the plain-text part stays one line: multi-line text crashed denomailer on the site (9/11/2026)
      { mimeType: 'text/plain; charset="utf-8"', content: b64Lines(m.text.replace(/\s*\r?\n+\s*/g, " ").trim()), transferEncoding: "base64" },
      { mimeType: 'text/html; charset="utf-8"', content: b64Lines(m.html), transferEncoding: "base64" },
    ],
  };
  if (m.bcc?.length) msg.bcc = m.bcc;
  try {
    await client.send(msg as any);
  } finally {
    await client.close();
  }
}

export const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
export const btn = (href: string, label: string) =>
  `<a href="${esc(href)}" style="display:inline-block;background:#c8102e;color:#fff;text-decoration:none;font-weight:700;padding:12px 18px;border-radius:999px;margin:8px 0">${esc(label)}</a>`;
export const quote = (s: string) =>
  `<div style="border-left:4px solid #c8102e;background:#fff;padding:12px 16px;margin:12px 0;white-space:pre-wrap">${esc(s)}</div>`;

export function wrapHtml(title: string, bodyHtml: string, footNote = "") {
  return `<!doctype html><html><body style="margin:0;background:#f4f1eb;font-family:Helvetica,Arial,sans-serif;color:#16140f">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
  <p style="font:800 13px/1 Helvetica,Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#c8102e;margin:0 0 14px">Valor Sports Academy</p>
  <h1 style="font-size:22px;line-height:1.25;margin:0 0 16px">${esc(title)}</h1>
  <div style="font-size:16px;line-height:1.55">${bodyHtml}</div>
  ${footNote ? `<p style="font-size:13px;color:#6b665c;margin-top:20px">${footNote}</p>` : ""}
  <p style="font-size:13px;color:#6b665c;margin-top:24px">Valor Sports Academy · <a href="tel:${VALOR.tel}" style="color:#c8102e">${VALOR.phone}</a></p>
</div></body></html>`;
}
