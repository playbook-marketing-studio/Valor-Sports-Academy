// Shared helpers for the Valor Train Pro edge functions.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export const admin: SupabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false, autoRefreshToken: false } },
);

export const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, x-ingest-key",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

export const bad = (message: string, status = 400) => json({ error: message }, status);

/** The signed-in user from the Authorization header, or null. */
export async function userFromRequest(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

/** The signed-in user if they are staff (profiles.role = admin), else null. */
export async function requireAdmin(req: Request) {
  const user = await userFromRequest(req);
  if (!user) return null;
  const { data } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
  return data?.role === "admin" ? user : null;
}

/** App origin for links: the caller's Origin header (the staff device), else the APP_URL secret. */
export function appOrigin(req: Request) {
  const o = req.headers.get("origin");
  if (o && /^https?:\/\//.test(o)) return o.replace(/\/$/, "");
  return (Deno.env.get("APP_URL") || "http://localhost:5173").replace(/\/$/, "");
}

/** A class or class pack, sold the way Valor sells at the gym. One-time only (Omar 9/23: no subscriptions). */
export type Item = { key: string; name: string; amount_cents: number; classes: number | null; expires_days: number | null };
export type EnrollmentConfig = { placeholder?: boolean; items: Item[] };
export async function enrollmentConfig(): Promise<EnrollmentConfig> {
  const { data } = await admin.from("settings").select("value").eq("key", "enrollment").maybeSingle();
  const v = (data?.value || {}) as Partial<EnrollmentConfig>;
  return { placeholder: !!v.placeholder, items: Array.isArray(v.items) ? v.items : [] };
}
/** Expiry for a purchase made now, or null when the item never expires. */
export function expiryFrom(from: Date, days: number | null | undefined) {
  if (!days || days <= 0) return null;
  return new Date(from.getTime() + days * 86400000).toISOString();
}
