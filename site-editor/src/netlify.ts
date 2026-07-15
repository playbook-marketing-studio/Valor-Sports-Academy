/**
 * Netlify Function entry (Functions v2, web-standard Request/Response).
 *
 * Routes:
 *   POST /mcp            — streamable-HTTP MCP endpoint (stateless JSON)
 *   GET  /mcp-temp/<id>  — short-lived unguessable temp images for the Image CDN
 *
 * Auth: single static bearer key (env EDIT_KEY), accepted as
 * `Authorization: Bearer <key>` or `?key=<key>` for clients that can't set
 * headers. Rotate the env var to revoke.
 */
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createHash, timingSafeEqual } from "node:crypto";
import { buildServer } from "./server.js";
import { openStore } from "./store.js";

const CORS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Authorization, Content-Type, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-Id",
  "Access-Control-Expose-Headers": "Mcp-Session-Id",
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...CORS },
  });
}

function sha256(s: string): Buffer {
  return createHash("sha256").update(s).digest();
}

function checkAuth(req: Request, url: URL): { ok: boolean; keyHash: string } {
  const configured = process.env.EDIT_KEY;
  if (!configured) return { ok: false, keyHash: "" };
  const header = req.headers.get("authorization") ?? "";
  const bearer = header.replace(/^Bearer\s+/i, "");
  const candidate = bearer || url.searchParams.get("key") || "";
  if (!candidate) return { ok: false, keyHash: "" };
  const a = sha256(candidate);
  const b = sha256(configured);
  const ok = timingSafeEqual(a, b);
  return { ok, keyHash: a.toString("hex").slice(0, 16) };
}

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);

  // --- temp images for the Image CDN (unguessable UUID, no key) -------------
  const tmpMatch = /^\/mcp-temp\/([a-f0-9-]{36})$/.exec(url.pathname);
  if (tmpMatch) {
    if (req.method !== "GET") return new Response("Method Not Allowed", { status: 405 });
    const tmp = openStore("site-editor-tmp");
    const key = `tmp-images/${tmpMatch[1]}`;
    const bytes = await tmp.getBytes(key);
    if (!bytes) return new Response("Not Found", { status: 404 });
    const contentType = (await tmp.getContentType(key)) ?? "application/octet-stream";
    return new Response(bytes, {
      status: 200,
      headers: { "Content-Type": contentType, "Cache-Control": "public, max-age=300" },
    });
  }

  // --- MCP endpoint ----------------------------------------------------------
  if (url.pathname !== "/mcp") return new Response("Not Found", { status: 404 });
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") {
    // Stateless server: no SSE stream, no sessions to delete.
    return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST, OPTIONS", ...CORS } });
  }

  if (!process.env.EDIT_KEY)
    return json(503, { error: "Server not configured (EDIT_KEY missing). Contact Playbook." });

  const auth = checkAuth(req, url);
  if (!auth.ok)
    return json(401, {
      error: "Unauthorized. Provide the edit key as a Bearer token or ?key= parameter.",
    });

  const server = buildServer({
    state: openStore("site-editor"),
    tmp: openStore("site-editor-tmp"),
    keyHash: auth.keyHash,
  });

  // Stateless: a fresh transport per request, JSON responses (no SSE stream).
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true,
  });

  try {
    await server.connect(transport);
    const res = await transport.handleRequest(req);
    const headers = new Headers(res.headers);
    for (const [k, v] of Object.entries(CORS)) headers.set(k, v);
    return new Response(res.body, { status: res.status, headers });
  } catch (err) {
    console.error("mcp-handler-error", err);
    return json(500, {
      jsonrpc: "2.0",
      error: { code: -32603, message: "Internal server error" },
      id: null,
    });
  }
}

export const config = {
  path: ["/mcp", "/mcp-temp/*"],
};
