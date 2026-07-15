/**
 * Safety-checklist tests, run against the SHIPPED bundle (netlify/functions/mcp.mjs)
 * in-process, with a file-backed store (SITE_EDITOR_LOCAL_STORE).
 *
 *   node test/checklist.test.mjs
 *
 * GitHub reads hit the real (public) repo. No commits happen here: GITHUB_TOKEN
 * is deliberately unset so apply/swap stop at the publishing gate.
 */
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

process.env.SITE_EDITOR_LOCAL_STORE = mkdtempSync(path.join(tmpdir(), "site-editor-test-"));
process.env.EDIT_KEY = "test-key-local-only";
delete process.env.GITHUB_TOKEN;

const { default: handler } = await import("../../netlify/functions/mcp.mjs");

const BASE = "https://local.test";
let failures = 0;
let n = 0;

function check(name, cond, detail = "") {
  n += 1;
  if (cond) console.log(`ok ${n} - ${name}`);
  else {
    failures += 1;
    console.error(`NOT OK ${n} - ${name}${detail ? `\n    ${detail}` : ""}`);
  }
}

async function post(body, { key = process.env.EDIT_KEY, viaQuery = false } = {}) {
  const url = viaQuery && key ? `${BASE}/mcp?key=${key}` : `${BASE}/mcp`;
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };
  if (!viaQuery && key) headers.authorization = `Bearer ${key}`;
  return handler(new Request(url, { method: "POST", headers, body: JSON.stringify(body) }));
}

let rpcId = 0;
async function call(name, args = {}, opts = {}) {
  const res = await post(
    { jsonrpc: "2.0", id: ++rpcId, method: "tools/call", params: { name, arguments: args } },
    opts
  );
  const data = await res.json().catch(() => null);
  return { status: res.status, result: data?.result, error: data?.error };
}

const text = (r) => r.result?.content?.[0]?.text ?? "";

// --- auth ------------------------------------------------------------------
{
  const res = await post({ jsonrpc: "2.0", id: 1, method: "tools/list" }, { key: null });
  check("unauthenticated request rejected (401)", res.status === 401);
}
{
  const res = await post({ jsonrpc: "2.0", id: 2, method: "tools/list" }, { key: "wrong-key" });
  check("wrong key rejected (401)", res.status === 401);
}
{
  const res = await handler(new Request(`${BASE}/mcp`, { method: "GET" }));
  check("GET /mcp → 405", res.status === 405);
}
{
  const res = await handler(new Request(`${BASE}/mcp`, { method: "OPTIONS" }));
  check("OPTIONS /mcp → 204 (CORS preflight)", res.status === 204);
}

// --- protocol ---------------------------------------------------------------
{
  const res = await post({
    jsonrpc: "2.0",
    id: ++rpcId,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "checklist-test", version: "0" },
    },
  });
  const data = await res.json();
  check(
    "initialize succeeds with server info",
    res.status === 200 && data?.result?.serverInfo?.name === "valor-site-editor",
    JSON.stringify(data).slice(0, 300)
  );
}
{
  const res = await post({ jsonrpc: "2.0", id: ++rpcId, method: "tools/list" });
  const data = await res.json();
  const names = (data?.result?.tools ?? []).map((t) => t.name).sort();
  check(
    "tools/list returns exactly the six spec tools",
    JSON.stringify(names) ===
      JSON.stringify(
        ["apply_change", "get_page_content", "list_pages", "propose_text_change", "revert_last_edit", "swap_image"].sort()
      ),
    JSON.stringify(names)
  );
}
{
  const res = await post({ jsonrpc: "2.0", id: ++rpcId, method: "tools/list" }, { viaQuery: true });
  check("?key= query auth also accepted", res.status === 200);
}

// --- read tools --------------------------------------------------------------
{
  const r = await call("list_pages");
  check(
    "list_pages returns friendly names, no file paths",
    text(r).includes("Home") && !text(r).includes(".html"),
    text(r).slice(0, 200)
  );
}
{
  const r = await call("get_page_content", { page: "Contact" });
  check(
    "get_page_content(Contact) returns verbatim source text (entities intact)",
    text(r).includes("11AM&ndash;8PM"),
    text(r).slice(0, 300)
  );
}
{
  const r = await call("get_page_content", { page: "no-such-page" });
  check("unknown page → helpful error listing valid pages", r.result?.isError && text(r).includes("Valid pages"));
}

// --- propose guardrails -------------------------------------------------------
{
  const r = await call("propose_text_change", {
    page: "Home",
    find: "Valor",
    replace: "Valour",
    reason: "test multi-match",
  });
  check(
    "ambiguous find (multi-match) → helpful count error",
    r.result?.isError && /appears \d+ times/.test(text(r)),
    text(r).slice(0, 200)
  );
}
{
  const r = await call("propose_text_change", {
    page: "Home",
    find: "zzz-definitely-not-on-the-page",
    replace: "anything",
    reason: "test no-match",
  });
  check("zero-match find → helpful error", r.result?.isError && /No match|No exact match/.test(text(r)));
}
{
  const r = await call("propose_text_change", {
    page: "netlify.toml",
    find: "publish",
    replace: "x",
    reason: "test protected path",
  });
  check("protected path via page name → rejected", r.result?.isError && /Unknown page/.test(text(r)));
}
{
  // The <title> lives in <head> — a protected region.
  const home = await call("get_page_content", { page: "Home" });
  void home;
  const r = await call("propose_text_change", {
    page: "Home",
    find: "Youth Sports Training in Richland",
    replace: "Kids Sports Training in Richland",
    reason: "test protected region",
  });
  check(
    "match inside <head>/nav/etc → region rejection (or multi-match guard)",
    r.result?.isError,
    text(r).slice(0, 250)
  );
}
{
  const r = await call("propose_text_change", {
    page: "Home",
    find: "Train With Purpose.",
    replace: "Train Hard.",
    reason: "test slogan guard",
  });
  check("slogan alteration → rejected", r.result?.isError && /slogan/.test(text(r)), text(r).slice(0, 250));
}
{
  const r = await call("propose_text_change", {
    page: "Contact",
    find: "11AM&ndash;8PM",
    replace: "x".repeat(3000),
    reason: "test oversized diff",
  });
  check("oversized diff (>2KB) → rejected", r.result?.isError && /too large/.test(text(r)));
}
{
  const r = await call("propose_text_change", {
    page: "Contact",
    find: "11AM&ndash;8PM",
    replace: '<script>alert(1)</script>',
    reason: "test code injection guard",
  });
  check("replacement containing code → rejected", r.result?.isError && /code/.test(text(r)));
}

// --- propose happy path (no commit), apply gate -------------------------------
let changeId = null;
{
  const r = await call("propose_text_change", {
    page: "Contact",
    find: "11AM&ndash;8PM",
    replace: "11AM&ndash;9PM",
    reason: "test hours change",
  });
  changeId = r.result?.structuredContent?.change_id ?? null;
  check(
    "valid propose → staged with change_id + before/after",
    !r.result?.isError && !!changeId && text(r).includes("Before:") && text(r).includes("After:"),
    text(r).slice(0, 300)
  );
  check(
    "shared-text hint fires for hours edits",
    /footer of every page/.test(text(r)),
    text(r).slice(-400)
  );
}
{
  const r = await call("apply_change", { change_id: changeId });
  check(
    "apply without GITHUB_TOKEN → clean 'publishing off' error, nothing committed",
    r.result?.isError && /Publishing isn't switched on/.test(text(r)),
    text(r).slice(0, 200)
  );
}
{
  const r = await call("apply_change", { change_id: "00000000-0000-0000-0000-000000000000" });
  check("bogus change_id → not-available error", r.result?.isError && /isn't available/.test(text(r)));
}

// --- swap_image ---------------------------------------------------------------
{
  const r = await call("swap_image", {
    image_description: "photo",
    new_image: "https://example.com/x.jpg",
  });
  check(
    "ambiguous image description → candidate list",
    r.result?.isError && /more than one photo|which one/.test(text(r)),
    text(r).slice(0, 300)
  );
}
{
  const r = await call("swap_image", {
    image_description: "purple dinosaur mural",
    new_image: "https://example.com/x.jpg",
  });
  check("unmatchable image description → helpful error", r.result?.isError, text(r).slice(0, 200));
}
{
  // 1x1 transparent PNG
  const png =
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
  const r = await call("swap_image", {
    page: "Contact",
    image_description: "community and grand opening photo",
    new_image: png,
  });
  check(
    "valid image resolves + stops at publishing gate (no token)",
    r.result?.isError && /Publishing isn't switched on/.test(text(r)),
    text(r).slice(0, 250)
  );
}

// --- revert -------------------------------------------------------------------
{
  const r = await call("revert_last_edit");
  check("revert with no edit history → 'nothing to undo'", r.result?.isError && /nothing to undo/i.test(text(r)));
}

// --- rate limit (runs last: exhausts the hourly call budget) -------------------
{
  let limited = false;
  for (let i = 0; i < 120; i++) {
    const r = await call("list_pages");
    if (r.result?.isError && /Rate limit/.test(text(r))) {
      limited = true;
      break;
    }
  }
  check("rate limit trips within the hourly window", limited);
}

console.log(failures === 0 ? `\nALL ${n} CHECKS PASSED` : `\n${failures}/${n} CHECKS FAILED`);
process.exit(failures === 0 ? 0 : 1);
