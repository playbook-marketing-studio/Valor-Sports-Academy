# Valor Site Editor — go-live + client onboarding

A remote MCP server at **`https://valorsportsacademywa.com/mcp`** that lets Valor's owners (Michael + Corey) make safe website edits through any AI assistant. Playbook holds all credentials; the client only ever gets a URL + key. Code: `site-editor/` (source) → bundled to `netlify/functions/mcp.mjs` (committed artifact; rebuild with `cd site-editor && npm run build`).

---

## 1. Omar: switch it on (one time, ~5 minutes)

The server is deployed but **fails closed** until two env vars exist.

1. **Create the GitHub token** — github.com → Settings → Developer settings → Personal access tokens → **Fine-grained tokens** → Generate new token:
   - Resource owner: `playbook-marketing-studio` · Repository access: **Only** `Valor-Sports-Academy`
   - Permissions → Repository → **Contents: Read and write** (nothing else)
   - Expiration: 1 year (calendar a renewal). Copy the token.
2. **Set env vars** — app.netlify.com → project `valor-sports-academy-staging-envi` → Site configuration → Environment variables → Add:
   - `EDIT_KEY` = the value of `VALOR_EDIT_KEY` in the vault (`Projects/playbook/.env`) — already generated
   - `GITHUB_TOKEN` = the fine-grained PAT from step 1
   - (Scope "Functions" is enough if asked; all-scopes is fine too.)
3. **Redeploy** — Deploys → Trigger deploy → Deploy site (env vars only take effect on a fresh deploy).
4. **Verify** — from this repo:
   ```
   cd site-editor
   E2E_ENDPOINT=https://valorsportsacademywa.com/mcp EDIT_KEY=<the key> node test/e2e-live.mjs
   ```
   It stages a trivial edit on the Thank-You page, publishes it, confirms it live, reverts it, and confirms the restore. Expect `E2E HAPPY PATH + REVERT: PASSED`.

**Key rotation / revoke:** change `EDIT_KEY` in Netlify → redeploy → text the client the new key. The old key dies instantly.

---

## 2. Client: connect it (one time, ~2 minutes, works in any MCP-capable AI)

1. In Claude: **Settings → Connectors → Add custom connector**
   - Name: `Valor Site Editor`
   - URL: `https://valorsportsacademywa.com/mcp?key=<EDIT_KEY>` (the key travels in the URL; if the connector form offers an auth/header field, you can instead use the bare `/mcp` URL with Bearer token `<EDIT_KEY>`)
2. Install the skill: `valor-website-editor.skill` (in `Projects/playbook/client-site-editor/dist/`; Omar sends it to the client — Settings → Capabilities → Skills → upload).
3. **Test phrase:** *"change the Saturday hours on the contact page to 9am-6pm"* → the assistant should show a before/after, ask to confirm, apply, and report "live in about 2 minutes". Then *"undo my last change"* to put it back.

The same URL+key works in other MCP clients (ChatGPT dev-mode connectors, Cursor, etc.).

---

## 3. What the client can / can't do (enforced server-side)

**Can:** edit text on the 15 public pages, swap the content photos (auto-resized/formatted), undo their changes. Every text edit is propose → preview → apply; one change per publish; ~2-minute deploys.

**Can't (tools don't exist / server refuses):** create or delete pages, touch navigation, layout, forms, tracking, page `<head>`, `netlify.toml`, redirects, styles, scripts, the logo, the hidden giveaway pages, or the slogan ("Train With Purpose. Rise With Valor." — protected, markup-proof). Diffs over 2KB are refused. Rate limits: 100 calls/hr, 20 published changes/hr per key.

**Audit trail:** every propose/apply/swap/revert is logged to Netlify Blobs (store `site-editor`, key `audit/YYYY-MM.jsonl` — readable in the Netlify UI under the project's Blobs tab) and echoed to the function logs (`site-editor-audit` lines). Commits are prefixed `valor-edit:` and authored by "Valor Site Editor <bot@playbookmarketing.studio>", so client edits are instantly distinguishable in git history.

---

## 4. Test status (2026-07-15)

| Check | Status |
|---|---|
| Unauthenticated / wrong key → rejected | ✅ local + live (401; 503 fail-closed pre-config) |
| Ambiguous `find` (0 or >1 matches) → helpful error | ✅ (near-miss returns the exact raw fragment to retry with) |
| Protected path / region → rejected | ✅ |
| Slogan alteration → rejected | ✅ (count-based, catches markup-spanning edits) |
| Oversized diff / code in replacement → rejected | ✅ |
| Rate limit trips | ✅ |
| Happy path: propose → apply → commit → deploy → live | ✅ ran against the live site (commit `abd9339`, reverted) |
| revert_last_edit → prior state live | ✅ same run |
| swap_image oversized photo → resized before commit | ⚠️ resize path unit-tested; full live pass needs `GITHUB_TOKEN` — rerun after §1 (swap any photo, then revert) |
| claude.ai custom-connector end-to-end (§2 test phrase) | ⚠️ needs a real claude.ai account — do during client onboarding dry-run |

Local test suite: `cd site-editor && npm install && npm test` (26 checks, no commits).

---

## 5. Next client (Eagle Harbor, ~Nov)

Same code, new config: copy `site-editor/` into their repo, rewrite `site.config.json` (pages, images, slogans, shared text, protected paths), `npm run build`, commit, set their `EDIT_KEY` + repo-scoped `GITHUB_TOKEN` on their Netlify site. Client skill: copy the flattened skill, swap the client specifics. No server code changes should be needed.
