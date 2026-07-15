/**
 * End-to-end happy path + revert against the LIVE site:
 *   propose → apply (real commit to main) → Netlify deploy → change live
 *   → revert_last_edit → previous version live again.
 *
 * Runs the handler in-process by default (needs GITHUB_TOKEN + EDIT_KEY env),
 * or against a deployed endpoint if E2E_ENDPOINT is set (e.g.
 * https://www.valorsportsacademywa.com/mcp — needs only EDIT_KEY).
 *
 * The edit is deliberately trivial and is fully reverted by the end.
 */

const PAGE = "Thank You";
const LIVE_URL = "https://www.valorsportsacademywa.com/thank-you";
const FIND = "A Valor coach will get back to you shortly.";
const REPLACE = "A Valor coach will get back to you very soon.";

const endpoint = process.env.E2E_ENDPOINT ?? null;
let handler = null;
if (!endpoint) {
  if (!process.env.EDIT_KEY || !process.env.GITHUB_TOKEN) {
    console.error("Set EDIT_KEY and GITHUB_TOKEN (or E2E_ENDPOINT + EDIT_KEY).");
    process.exit(1);
  }
  process.env.SITE_EDITOR_LOCAL_STORE ??= "/tmp/site-editor-e2e-store";
  ({ default: handler } = await import("../../netlify/functions/mcp.mjs"));
}

let rpcId = 0;
async function call(name, args = {}) {
  const body = JSON.stringify({
    jsonrpc: "2.0",
    id: ++rpcId,
    method: "tools/call",
    params: { name, arguments: args },
  });
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
    authorization: `Bearer ${process.env.EDIT_KEY}`,
  };
  const res = endpoint
    ? await fetch(endpoint, { method: "POST", headers, body })
    : await handler(new Request("https://local.test/mcp", { method: "POST", headers, body }));
  const data = await res.json();
  const text = data.result?.content?.[0]?.text ?? JSON.stringify(data);
  if (data.result?.isError) throw new Error(`${name} failed: ${text}`);
  return { text, structured: data.result?.structuredContent };
}

async function pollLive(needle, label, attempts = 24, delayMs = 10000) {
  for (let i = 1; i <= attempts; i++) {
    const res = await fetch(`${LIVE_URL}?nocache=${Date.now()}`, {
      headers: { "cache-control": "no-cache" },
    });
    const html = await res.text();
    if (html.includes(needle)) {
      console.log(`LIVE ✓ ${label} (after ${i} checks)`);
      return;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  throw new Error(`Timed out waiting for live site to show: ${label}`);
}

console.log("1) propose…");
const p = await call("propose_text_change", {
  page: PAGE,
  find: FIND,
  replace: REPLACE,
  reason: "E2E test edit (will be reverted)",
});
console.log(p.text.split("\n").slice(0, 6).join("\n"));
const changeId = p.structured?.change_id;

console.log("\n2) apply…");
const a = await call("apply_change", { change_id: changeId });
console.log(a.text);

console.log("\n3) wait for deploy…");
await pollLive(REPLACE, "edit deployed");

console.log("\n4) revert_last_edit…");
const r = await call("revert_last_edit");
console.log(r.text);

console.log("\n5) wait for restore…");
await pollLive(FIND, "original restored");

console.log("\nE2E HAPPY PATH + REVERT: PASSED");
