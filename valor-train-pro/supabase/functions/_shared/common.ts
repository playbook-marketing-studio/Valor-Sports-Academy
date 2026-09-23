// Shared helpers for the Valor Train Pro edge functions.
import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2.45.4";

export const admin: SupabaseClient = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } },
);

export const cors = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type, stripe-signature",
  "access-control-allow-methods": "GET, POST, OPTIONS",
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "content-type": "application/json" } });

export const bad = (message: string, status = 400) => json({ error: message }, status);

/** Resolve the calling user from a Supabase JWT in the Authorization header (null when absent/invalid). */
export async function userFromRequest(req: Request) {
  const auth = req.headers.get("authorization") || "";
  const token = auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;
  return data.user;
}

/** Load a booking the caller is allowed to touch: by claim token, or as its parent, or as an admin. */
export async function authorizedBooking(req: Request, bookingId: string, claimToken?: string | null) {
  if (!bookingId) return { booking: null, user: null, reason: "missing booking id" };
  const { data: booking } = await admin.from("bookings").select("*").eq("id", bookingId).maybeSingle();
  if (!booking) return { booking: null, user: null, reason: "booking not found" };
  const user = await userFromRequest(req);
  if (claimToken && booking.claim_token === claimToken) return { booking, user, reason: null };
  if (user) {
    if (booking.parent_id === user.id) return { booking, user, reason: null };
    const { data: prof } = await admin.from("profiles").select("role").eq("id", user.id).maybeSingle();
    if (prof?.role === "admin") return { booking, user, reason: null };
  }
  return { booking: null, user, reason: "not allowed" };
}

export async function assessmentSettings() {
  const { data } = await admin.from("settings").select("value").eq("key", "assessment").maybeSingle();
  return {
    fee_cents: 5000, currency: "usd", open_until: "2026-11-28", blackouts: [] as string[],
    start_min: 600, end_min: 780, slot_min: 30, weekday: 6, tz: "America/Los_Angeles",
    address: "1973 Fowler St, Richland, WA 99352",
    ...(data?.value || {}),
  };
}

/** Public app origin for redirects: the request's Origin header, else the APP_URL secret. */
export function appOrigin(req: Request) {
  const o = req.headers.get("origin");
  if (o && /^https?:\/\//.test(o)) return o.replace(/\/$/, "");
  return (Deno.env.get("APP_URL") || "http://localhost:5173").replace(/\/$/, "");
}

export const publicBooking = (b: Record<string, unknown>) => {
  const { claim_token: _t, ...rest } = b;
  return rest;
};
