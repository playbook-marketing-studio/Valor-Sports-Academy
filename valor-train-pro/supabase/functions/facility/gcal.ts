// Google Calendar link for the facility calendar (Omar 11/11/2026: "can we link it to their valor calendar").
//   out: every approved block (rental, Valor class, closed) is an event on Valor's Google Calendar,
//        kept in step when it changes or is removed in the app
//   in:  timed events already on that calendar are cached in facility_gcal_busy and block the floor
// One connection for the whole app (table facility_gcal, one row). A coach connects it with a click:
// Google shows its own Allow screen, nobody shares a password. Editing in Google does NOT change the app.
// Secrets: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, FACILITY_ENC_KEY (base64, 32 bytes: encrypts the
// refresh token and signs the connect link). Redirect URI to register on the Google OAuth client:
//   <SUPABASE_URL>/functions/v1/facility/gcal-callback
import { admin } from "../_shared/common.ts";
import { TZ } from "./time.ts";

const SCOPES = "openid email https://www.googleapis.com/auth/calendar.events.owned";
const API = Deno.env.get("GOOGLE_CALENDAR_API") || "https://www.googleapis.com/calendar/v3";
const TOKEN_URL = Deno.env.get("GOOGLE_TOKEN_URL") || "https://oauth2.googleapis.com/token";
const MARK = "valorBlock"; // private extended property on the events this app writes

export const gcalConfigured = () => !!(Deno.env.get("GOOGLE_CLIENT_ID") && Deno.env.get("GOOGLE_CLIENT_SECRET") && Deno.env.get("FACILITY_ENC_KEY"));
export const redirectUri = () => `${Deno.env.get("SUPABASE_URL")!.replace(/\/$/, "")}/functions/v1/facility/gcal-callback`;

const b64 = (b: Uint8Array) => btoa(String.fromCharCode(...b));
const unb64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64url = (s: string) => btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = (s: string) => atob(s.replace(/-/g, "+").replace(/_/g, "/"));
const rawKey = () => unb64(Deno.env.get("FACILITY_ENC_KEY")!);

async function encrypt(plain: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", rawKey(), "AES-GCM", false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = new Uint8Array(await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain)));
  return `${b64(iv)}.${b64(ct)}`;
}
async function decrypt(enc: string): Promise<string> {
  const [iv, ct] = enc.split(".");
  const key = await crypto.subtle.importKey("raw", rawKey(), "AES-GCM", false, ["decrypt"]);
  return new TextDecoder().decode(await crypto.subtle.decrypt({ name: "AES-GCM", iv: unb64(iv) }, key, unb64(ct)));
}
async function sign(payload: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", rawKey(), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload)))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Google's Allow screen for a coach. The link is good for 10 minutes. */
export async function connectUrl(userId: string, origin: string, loginHint = ""): Promise<string> {
  const payload = b64url(JSON.stringify({ u: userId, o: origin, exp: Date.now() + 10 * 60000 }));
  const state = `${payload}.${await sign(payload)}`;
  const q = new URLSearchParams({
    client_id: Deno.env.get("GOOGLE_CLIENT_ID")!, redirect_uri: redirectUri(), response_type: "code", scope: SCOPES,
    access_type: "offline", prompt: "consent", include_granted_scopes: "false", state,
  });
  if (loginHint) q.set("login_hint", loginHint);
  return `https://accounts.google.com/o/oauth2/v2/auth?${q}`;
}

/** Google sends the coach back here. Stores the connection, then returns where to send their browser. */
export async function handleCallback(url: URL): Promise<string> {
  const state = url.searchParams.get("state") || "";
  const [payload, sig] = state.split(".");
  let st: { u: string; o: string; exp: number } | null = null;
  try { if (payload && sig && sig === await sign(payload)) st = JSON.parse(unb64url(payload)); } catch { st = null; }
  const fallback = (Deno.env.get("APP_URL") || "https://app.valorsportsacademywa.com").replace(/\/$/, "");
  if (!st || st.exp < Date.now()) return `${fallback}/admin/facility?gcal=expired`;
  const back = (r: string) => `${st!.o}/admin/facility?gcal=${r}`;
  if (url.searchParams.get("error")) return back("declined");
  const code = url.searchParams.get("code");
  if (!code) return back("failed");
  const { data: prof } = await admin.from("profiles").select("role").eq("id", st.u).maybeSingle();
  if (prof?.role !== "admin") return back("failed");

  const res = await fetch(TOKEN_URL, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: Deno.env.get("GOOGLE_CLIENT_ID")!, client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!, redirect_uri: redirectUri(), grant_type: "authorization_code" }),
  });
  const tok = await res.json().catch(() => ({}));
  if (!res.ok || !tok.refresh_token) { console.error("gcal token exchange failed", res.status, tok?.error); return back("failed"); }
  if (!String(tok.scope || "").includes("calendar.events")) return back("noaccess"); // they unticked the calendar box
  let email = "";
  try { email = JSON.parse(unb64url(String(tok.id_token).split(".")[1])).email || ""; } catch { /* no email */ }
  const { error } = await admin.from("facility_gcal").upsert({
    id: 1, email, calendar_id: "primary", refresh_token_enc: await encrypt(tok.refresh_token),
    connected_at: new Date().toISOString(), connected_by: st.u, last_error: null, last_sync_at: null,
  });
  if (error) { console.error("gcal save failed", error.message); return back("failed"); }
  return back("connected");
}

export type GcalRow = { email: string | null; calendar_id: string; refresh_token_enc: string | null; connected_at: string | null; last_sync_at: string | null; last_error: string | null };
export async function gcalRow(): Promise<GcalRow | null> {
  const { data } = await admin.from("facility_gcal").select("email, calendar_id, refresh_token_enc, connected_at, last_sync_at, last_error").eq("id", 1).maybeSingle();
  return (data as GcalRow) || null;
}
export const isConnected = (row: GcalRow | null) => !!row?.refresh_token_enc && gcalConfigured();

export async function disconnect() {
  await admin.from("facility_gcal").update({ refresh_token_enc: null, last_error: null }).eq("id", 1);
  await admin.from("facility_gcal_busy").delete().neq("event_id", "");
}

let cached: { token: string; exp: number } | null = null;
async function accessToken(row: GcalRow): Promise<string> {
  if (cached && cached.exp > Date.now() + 60000) return cached.token;
  const res = await fetch(TOKEN_URL, {
    method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: Deno.env.get("GOOGLE_CLIENT_ID")!, client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!, refresh_token: await decrypt(row.refresh_token_enc!), grant_type: "refresh_token" }),
  });
  const tok = await res.json().catch(() => ({}));
  if (!res.ok || !tok.access_token) {
    const gone = tok?.error === "invalid_grant";
    await admin.from("facility_gcal").update({ last_error: gone ? "reconnect" : `token ${res.status}` }).eq("id", 1);
    throw new Error(gone ? "Google needs to be connected again" : `Google token error ${res.status}`);
  }
  cached = { token: tok.access_token, exp: Date.now() + (Number(tok.expires_in) || 3000) * 1000 };
  return cached.token;
}

async function g(row: GcalRow, method: string, path: string, body?: unknown): Promise<{ status: number; data: any }> {
  const res = await fetch(`${API}/calendars/${encodeURIComponent(row.calendar_id || "primary")}${path}`, {
    method, headers: { authorization: `Bearer ${await accessToken(row)}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = res.status === 204 ? null : await res.json().catch(() => null);
  return { status: res.status, data };
}

/** Pull what is on the Google Calendar for a window into the cache. Skips all-day events, events marked Free and this app's own. */
export async function refreshBusy(row: GcalRow, from: Date, to: Date) {
  const rows: { event_id: string; title: string | null; starts_at: string; ends_at: string }[] = [];
  let pageToken = "";
  for (let page = 0; page < 8; page++) {
    const q = new URLSearchParams({ singleEvents: "true", orderBy: "startTime", timeMin: from.toISOString(), timeMax: to.toISOString(), maxResults: "250", showDeleted: "false" });
    if (pageToken) q.set("pageToken", pageToken);
    const { status, data } = await g(row, "GET", `/events?${q}`);
    if (status !== 200) throw new Error(`Google calendar read failed (${status})`);
    for (const e of data.items || []) {
      if (e.status === "cancelled" || !e.start?.dateTime || !e.end?.dateTime) continue; // all-day events never block
      if (e.transparency === "transparent") continue;                                   // marked "Free" in Google
      if (e.extendedProperties?.private?.[MARK]) continue;                              // this app's own events
      rows.push({ event_id: e.id, title: e.summary || null, starts_at: new Date(e.start.dateTime).toISOString(), ends_at: new Date(e.end.dateTime).toISOString() });
    }
    pageToken = data.nextPageToken || "";
    if (!pageToken) break;
  }
  await admin.from("facility_gcal_busy").delete().lt("starts_at", to.toISOString()).gt("ends_at", from.toISOString());
  if (rows.length) await admin.from("facility_gcal_busy").upsert(rows.map((r) => ({ ...r, fetched_at: new Date().toISOString() })));
  await admin.from("facility_gcal").update({ last_sync_at: new Date().toISOString(), last_error: null }).eq("id", 1);
  return rows.length;
}

export function eventTitle(b: Record<string, any>, renterName: string | null): string {
  if (b.kind === "rental") return `Rental: ${renterName || "renter"}, ${b.space === "half" ? "half turf" : "full turf"}`;
  if (b.kind === "closed") return `Closed${b.title ? `: ${b.title}` : ""}`;
  return b.title || "Valor class";
}

function eventBody(b: Record<string, any>, renterName: string | null) {
  return {
    summary: eventTitle(b, renterName),
    description: [b.note ? `Note from the renter: ${b.note}` : "", "From the Valor app's facility calendar. Change it in the app, not here."].filter(Boolean).join("\n\n"),
    start: { dateTime: new Date(b.starts_at).toISOString(), timeZone: TZ },
    end: { dateTime: new Date(b.ends_at).toISOString(), timeZone: TZ },
    extendedProperties: { private: { [MARK]: b.id } },
  };
}

/**
 * Bring Google in step with the app: add or update events for approved blocks, remove the events of
 * blocks that were canceled or declined. Works through a few at a time; whatever is left goes next call.
 */
export async function syncOut(row: GcalRow, limit = 40): Promise<{ pushed: number; removed: number; failed: number; left: number }> {
  const out = { pushed: 0, removed: 0, failed: 0, left: 0 };
  const since = new Date(Date.now() - 86400000).toISOString();
  const { data: all } = await admin.from("facility_blocks")
    .select("id, kind, renter_id, title, space, starts_at, ends_at, status, note, updated_at, gcal_event_id, gcal_synced_at, facility_renters(name, is_example)")
    .or(`gcal_event_id.not.is.null,and(status.eq.approved,ends_at.gt."${since}")`)
    .order("starts_at").limit(1000);
  const todo = (all || []).filter((b: any) => {
    if (b.facility_renters?.is_example) return false;
    if (b.status === "approved") return new Date(b.ends_at).toISOString() > since && (!b.gcal_event_id || !b.gcal_synced_at || new Date(b.gcal_synced_at) < new Date(b.updated_at));
    return !!b.gcal_event_id; // pending again, declined or canceled: its event has to go
  });
  out.left = Math.max(0, todo.length - limit);
  if (todo.length) await accessToken(row); // one clear failure instead of one per block when Google says no
  for (const b of todo.slice(0, limit) as any[]) {
    try {
      const name = b.facility_renters?.name || null;
      if (b.status !== "approved") {
        const r = await g(row, "DELETE", `/events/${encodeURIComponent(b.gcal_event_id)}`);
        if (![200, 204, 404, 410].includes(r.status)) throw new Error(`delete ${r.status}`);
        await admin.from("facility_blocks").update({ gcal_event_id: null, gcal_synced_at: new Date().toISOString(), gcal_error: null }).eq("id", b.id);
        out.removed++;
        continue;
      }
      let r = b.gcal_event_id ? await g(row, "PATCH", `/events/${encodeURIComponent(b.gcal_event_id)}`, eventBody(b, name)) : null;
      if (!r || r.status === 404 || r.status === 410) r = await g(row, "POST", "/events", eventBody(b, name)); // gone in Google: put it back
      if (r.status !== 200) throw new Error(`write ${r.status}`);
      await admin.from("facility_blocks").update({ gcal_event_id: r.data.id, gcal_synced_at: new Date().toISOString(), gcal_error: null }).eq("id", b.id);
      out.pushed++;
    } catch (e) {
      out.failed++;
      await admin.from("facility_blocks").update({ gcal_error: String((e as Error).message).slice(0, 200) }).eq("id", b.id);
    }
  }
  return out;
}
