/**
 * The MCP server: exactly six tools, propose → apply as the core safety flow.
 * Every guardrail here is enforced server-side; the client-facing skill is
 * guidance only.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { config, isProtectedPath, resolvePage, sharedTextHints } from "./config.js";
import { commitMessage, getFile, putFile } from "./github.js";
import {
  extractText,
  findMatches,
  nearMatch,
  protectedSpans,
  regionLabel,
  sloganHealthWarning,
  sloganViolated,
  spanAt,
} from "./html.js";
import { acquireImage, mimeFor, resizeToMatch, resolveImage } from "./images.js";
import { audit, bumpRate, KV } from "./store.js";

interface Proposal {
  id: string;
  page: string;
  path: string;
  find: string;
  replace: string;
  reason: string;
  baseSha: string;
  createdAt: string;
}

interface EditEntry {
  type: "edit" | "revert";
  kind: "text" | "image";
  page: string;
  path: string;
  message: string;
  commitSha: string;
  commitUrl: string;
  newFileSha: string;
  prevKey?: string; // blob key holding the pre-edit file content
  ts: string;
  reverted?: boolean;
}

const STACK_KEY = "edits/stack";
const STACK_MAX = 50;

const UNSAFE_REPLACE = /<\s*script|<\s*iframe|javascript:|\bon[a-z]+\s*=/i;

export interface ServerDeps {
  state: KV; // proposals, edit stack, rate limits, audit
  tmp: KV; // temp image uploads served at /mcp-temp/*
  keyHash: string; // hash of the caller's key, for rate limiting
}

function ok(text: string, structured?: Record<string, unknown>) {
  return {
    content: [{ type: "text" as const, text }],
    ...(structured ? { structuredContent: structured } : {}),
  };
}

function fail(text: string) {
  return { content: [{ type: "text" as const, text }], isError: true };
}

const snippet = (src: string, at: number, len: number, pad = 80) =>
  `${at - pad > 0 ? "…" : ""}${src.slice(Math.max(0, at - pad), at)}` +
  `【${src.slice(at, at + len)}】` +
  `${src.slice(at + len, at + len + pad)}${at + len + pad < src.length ? "…" : ""}`;

export function buildServer(deps: ServerDeps): McpServer {
  const server = new McpServer(
    { name: config.serverName, version: "1.0.0" },
    {
      instructions: [
        `Website editor for ${config.client} (${config.siteUrl}).`,
        "Flow for text edits: get_page_content → propose_text_change → show the user the before/after in plain language → apply_change once they confirm.",
        "Every applied change goes live in about 2 minutes. revert_last_edit undoes the most recent change.",
        "Talk to the user in plain English: no file names, no code, no technical jargon.",
        "This editor deliberately cannot create/delete pages, change navigation, layout, forms, tracking, or site settings. For those, write up what the user wants and route it to Omar at Playbook.",
      ].join("\n"),
    }
  );

  const guarded = <A extends Record<string, unknown>>(
    tool: string,
    handler: (args: A) => Promise<any>
  ) => {
    return async (args: A) => {
      const rate = await bumpRate(deps.state, deps.keyHash, "call", config.limits);
      if (!rate.ok) return fail(rate.message);
      try {
        return await handler(args);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        await audit(deps.state, {
          ts: new Date().toISOString(),
          tool,
          ok: false,
          summary: msg.slice(0, 200),
        });
        return fail(`Error: ${msg}`);
      }
    };
  };

  const commitGate = async (): Promise<string | null> => {
    if (!process.env.GITHUB_TOKEN)
      return "Publishing isn't switched on yet for this editor (the site credential is missing). Text Omar.";
    const rate = await bumpRate(deps.state, deps.keyHash, "commit", config.limits);
    return rate.ok ? null : rate.message;
  };

  const pushStack = async (entry: EditEntry): Promise<void> => {
    const stack = (await deps.state.getJSON<EditEntry[]>(STACK_KEY)) ?? [];
    stack.push(entry);
    await deps.state.setJSON(STACK_KEY, stack.slice(-STACK_MAX));
  };

  // -------------------------------------------------------------------------
  server.registerTool(
    "list_pages",
    {
      title: "List editable pages",
      description:
        "List the website pages this editor can change, with a plain-English description of each. Use these page names in every other tool. Pages, sections or settings not listed here can't be edited with these tools — route those requests to Omar.",
      inputSchema: {},
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    guarded("list_pages", async () => {
      const pages = Object.entries(config.pages).map(([name, p]) => ({
        page: name,
        description: p.description,
      }));
      const text = [
        `Pages you can edit on the ${config.client} site:`,
        "",
        ...pages.map((p) => `- **${p.page}** — ${p.description}`),
        "",
        "Not editable here (route to Omar): navigation menu, forms, page layout, tracking, new pages, deleting pages.",
      ].join("\n");
      return ok(text, { pages });
    })
  );

  // -------------------------------------------------------------------------
  server.registerTool(
    "get_page_content",
    {
      title: "Read a page's text",
      description:
        "Get the current text content of a page so you can locate the exact wording to change. Returns the text exactly as stored, including character codes like &ndash; (–) and &amp; (&). When you later call propose_text_change, copy the `find` string EXACTLY from this output, character codes included.",
      inputSchema: {
        page: z.string().describe('Page name from list_pages, e.g. "Home" or "Contact"'),
      },
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    guarded("get_page_content", async ({ page }: { page: string }) => {
      const resolved = resolvePage(page);
      if ("error" in resolved) return fail(resolved.error);
      const file = await getFile(resolved.entry.path);
      const text = extractText(file.text);
      // Brand words ("Valor") appear in normal copy everywhere; only check
      // slogan health on pages that are supposed to carry the intact slogan.
      const warning = config.sloganPages.includes(resolved.page)
        ? sloganHealthWarning(file.text)
        : null;
      const hasForm = /<form\b/i.test(file.text);
      const notes = [
        `Locked areas on this page (not editable): the navigation menu${hasForm ? ", the form" : ""}, tracking and page settings.`,
        "Text below is shown exactly as stored. Character codes like &ndash; &middot; &amp; are intentional — include them verbatim in propose_text_change `find` strings.",
      ];
      if (warning) notes.unshift(warning);
      return ok(
        [`# ${resolved.page}`, "", ...notes.map((n) => `> ${n}`), "", text].join("\n"),
        { page: resolved.page, sloganWarning: warning ?? undefined }
      );
    })
  );

  // -------------------------------------------------------------------------
  server.registerTool(
    "propose_text_change",
    {
      title: "Propose a text change",
      description:
        "Stage a text edit on a page. `find` must match EXACTLY ONE spot in the page (copy it verbatim from get_page_content, including character codes like &ndash;). Nothing goes live: you get back a change_id plus a before/after preview to show the user. Apply it with apply_change after the user confirms. Change IDs expire after 15 minutes.",
      inputSchema: {
        page: z.string().describe("Page name from list_pages"),
        find: z
          .string()
          .min(3)
          .describe("Exact current text to replace — must appear exactly once on the page"),
        replace: z.string().describe("The new text"),
        reason: z
          .string()
          .min(3)
          .describe('Short plain-English reason, e.g. "Update Saturday hours"'),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    guarded(
      "propose_text_change",
      async ({ page, find, replace, reason }: { page: string; find: string; replace: string; reason: string }) => {
        const resolved = resolvePage(page);
        if ("error" in resolved) return fail(resolved.error);
        if (isProtectedPath(resolved.entry.path))
          return fail("That page is locked. Route this change to Omar.");
        if (find === replace) return fail("`find` and `replace` are identical — nothing would change.");
        if (find.length + replace.length > config.limits.maxDiffChars)
          return fail(
            `This change is too large for the editor (over ${config.limits.maxDiffChars} characters). Big rewrites should go through Omar — write up what the user wants and route it to him.`
          );
        if (UNSAFE_REPLACE.test(replace))
          return fail("The replacement contains code, which this editor can't add. Route it to Omar.");

        const file = await getFile(resolved.entry.path);
        const matches = findMatches(file.text, find);
        if (matches.length === 0) {
          const near = nearMatch(file.text, find);
          return fail(
            near
              ? `No exact match for that text on ${resolved.page}. The page stores it slightly differently. Here is the raw fragment — copy the \`find\` string exactly from this (character codes and any tags included):\n\n${near}`
              : `No match for that text on ${resolved.page}. Run get_page_content and copy the text exactly as shown there. If the text sits across formatting boundaries, include the formatting codes around it.`
          );
        }
        if (matches.length > 1)
          return fail(
            `That text appears ${matches.length} times on ${resolved.page}. Add a few surrounding words to \`find\` so it matches exactly once.`
          );

        const at = matches[0];
        const spans = protectedSpans(file.text);
        const hit = spanAt(spans, at, at + find.length);
        if (hit)
          return fail(
            `That text is inside ${regionLabel(hit.kind)}, which this editor can't change. Route the request to Omar.`
          );

        const newText =
          file.text.slice(0, at) + replace + file.text.slice(at + find.length);
        if (sloganViolated(file.text, newText))
          return fail(
            `That change would alter the site slogan ("${config.slogans.join(
              '" / "'
            )}"), which is protected. If the owners genuinely want the slogan changed, route it to Omar.`
          );

        const proposal: Proposal = {
          id: randomUUID(),
          page: resolved.page,
          path: resolved.entry.path,
          find,
          replace,
          reason,
          baseSha: file.sha,
          createdAt: new Date().toISOString(),
        };
        await deps.state.setJSON(`proposals/${proposal.id}`, proposal);
        await audit(deps.state, {
          ts: proposal.createdAt,
          tool: "propose_text_change",
          page: resolved.page,
          ok: true,
          summary: `proposed: ${reason} (${find.length}→${replace.length} chars)`,
        });

        const hints = sharedTextHints(
          find,
          file.text.slice(Math.max(0, at - 60), at + find.length + 60)
        );
        const lines = [
          `Staged (nothing is live yet). change_id: ${proposal.id}`,
          "",
          `Before: ${snippet(file.text, at, find.length)}`,
          "",
          `After: ${snippet(newText, at, replace.length)}`,
          "",
          "Show the user the change in plain language. When they confirm, call apply_change with the change_id. It expires in 15 minutes.",
          ...(hints.length ? ["", ...hints.map((h) => `Note: ${h}`)] : []),
        ];
        return ok(lines.join("\n"), {
          change_id: proposal.id,
          page: resolved.page,
          expires_in_minutes: config.limits.proposalTtlMinutes,
        });
      }
    )
  );

  // -------------------------------------------------------------------------
  server.registerTool(
    "apply_change",
    {
      title: "Apply a proposed change",
      description:
        "Publish a change staged with propose_text_change. Commits the edit to the live site; it deploys automatically and is live in about 2 minutes. Only call after the user has confirmed the before/after (trivial typo fixes may be applied immediately).",
      inputSchema: {
        change_id: z.string().describe("The change_id returned by propose_text_change"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    guarded("apply_change", async ({ change_id }: { change_id: string }) => {
      const key = `proposals/${change_id}`;
      const proposal = await deps.state.getJSON<Proposal>(key);
      if (!proposal)
        return fail(
          "That change_id isn't available — it may have expired (15 minutes) or already been applied. Propose the change again."
        );
      const ageMin =
        (Date.now() - new Date(proposal.createdAt).getTime()) / 60000;
      if (ageMin > config.limits.proposalTtlMinutes) {
        await deps.state.delete(key);
        return fail("That proposal expired (15-minute limit). Propose the change again.");
      }
      const gate = await commitGate();
      if (gate) return fail(gate);

      const file = await getFile(proposal.path);
      const matches = findMatches(file.text, proposal.find);
      if (matches.length !== 1)
        return fail(
          "The page changed since this was proposed and the text no longer matches exactly once. Propose the change again from fresh page content."
        );
      const at = matches[0];
      const hit = spanAt(protectedSpans(file.text), at, at + proposal.find.length);
      if (hit)
        return fail(`That text is now inside ${regionLabel(hit.kind)} — not editable. Route to Omar.`);
      const newText =
        file.text.slice(0, at) +
        proposal.replace +
        file.text.slice(at + proposal.find.length);
      if (sloganViolated(file.text, newText))
        return fail("Applying now would alter the protected slogan. Propose again or route to Omar.");

      const message = commitMessage(`${proposal.reason} (${proposal.page})`);
      const prevKey = `edits/prev/${randomUUID()}`;
      await deps.state.setText(prevKey, file.text);
      const commit = await putFile(
        proposal.path,
        Buffer.from(newText, "utf8").toString("base64"),
        message,
        file.sha
      );
      await pushStack({
        type: "edit",
        kind: "text",
        page: proposal.page,
        path: proposal.path,
        message,
        commitSha: commit.commitSha,
        commitUrl: commit.commitUrl,
        newFileSha: commit.newFileSha,
        prevKey,
        ts: new Date().toISOString(),
      });
      await deps.state.delete(key);
      await audit(deps.state, {
        ts: new Date().toISOString(),
        tool: "apply_change",
        page: proposal.page,
        ok: true,
        summary: `applied: ${proposal.reason}`,
        commit: commit.commitSha,
      });
      return ok(
        `Done — the change to ${proposal.page} is published and ${config.deployNote}. (Reference: ${commit.commitUrl})\n\nTell the user it's live in about 2 minutes. If it looks wrong, revert_last_edit undoes it.`,
        { page: proposal.page, commit: commit.commitSha }
      );
    })
  );

  // -------------------------------------------------------------------------
  server.registerTool(
    "swap_image",
    {
      title: "Swap a photo",
      description:
        "Replace one of the site's photos with a new one. Describe which photo in plain English (e.g. \"the big photo of the coaches at the top of the homepage\"); if it's ambiguous you'll get candidates back to check with the user. Provide the new image as an http(s) URL or base64. The server resizes/compresses it to match the old photo exactly, then publishes (live in ~2 minutes). Note: some photos appear on several pages — the response says which.",
      inputSchema: {
        page: z
          .string()
          .optional()
          .describe("Page name where the user is looking at the photo (helps disambiguate)"),
        image_description: z
          .string()
          .min(3)
          .describe("Plain-English description of which photo to replace"),
        new_image: z
          .string()
          .min(8)
          .describe("The new image: an http(s) URL or a base64/data-URI string (JPEG, PNG or WebP)"),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    guarded(
      "swap_image",
      async ({ page, image_description, new_image }: { page?: string; image_description: string; new_image: string }) => {
        const resolved = resolveImage(image_description, page);
        if ("candidates" in resolved) {
          if (!resolved.candidates.length)
            return fail(
              "No swappable photo matches that description. The logo and social-preview images are locked (route those to Omar). Ask the user which photo they mean — list_pages + get_page_content can help you narrow it down."
            );
          const list = resolved.candidates
            .map((c) => `- "${c.name}" (appears on: ${c.entry.pages.join(", ")})`)
            .join("\n");
          return fail(
            `That description matches more than one photo. Ask the user which one they mean, then call swap_image again with the matching description:\n${list}`
          );
        }
        const target = resolved.match;
        if (isProtectedPath(target.entry.path))
          return fail("That image is locked. Route the request to Omar.");

        const img = await acquireImage(new_image);
        const gate = await commitGate();
        if (gate) return fail(gate);

        const oldFile = await getFile(target.entry.path);
        const resized = await resizeToMatch(deps.tmp, img, target.entry);

        const message = commitMessage(
          `swap photo "${target.name}" (${target.entry.path.split("/").pop()})`
        );
        const prevKey = `edits/prev/${randomUUID()}`;
        await deps.state.setText(prevKey, oldFile.contentB64);
        const commit = await putFile(
          target.entry.path,
          Buffer.from(resized).toString("base64"),
          message,
          oldFile.sha
        );
        await pushStack({
          type: "edit",
          kind: "image",
          page: target.entry.pages[0] ?? "",
          path: target.entry.path,
          message,
          commitSha: commit.commitSha,
          commitUrl: commit.commitUrl,
          newFileSha: commit.newFileSha,
          prevKey,
          ts: new Date().toISOString(),
        });
        await audit(deps.state, {
          ts: new Date().toISOString(),
          tool: "swap_image",
          page: target.entry.pages.join("/"),
          ok: true,
          summary: `swapped ${target.name} (${img.width}x${img.height} ${img.type} → ${target.entry.width}x${target.entry.height} ${target.entry.format})`,
          commit: commit.commitSha,
        });
        const multi =
          target.entry.pages.length > 1
            ? ` Heads up: this photo appears on ${target.entry.pages.length} pages (${target.entry.pages.join(
                ", "
              )}), so it changes everywhere.`
            : "";
        return ok(
          `Done — the "${target.name}" was replaced (resized to fit automatically) and ${config.deployNote}.${multi}\n\nIf it looks wrong once live, revert_last_edit puts the old photo back. (Reference: ${commit.commitUrl})`,
          { image: target.name, pages: target.entry.pages, commit: commit.commitSha }
        );
      }
    )
  );

  // -------------------------------------------------------------------------
  server.registerTool(
    "revert_last_edit",
    {
      title: "Undo the last change",
      description:
        "The panic button: reverts the most recent change made through this editor (text or photo) and republishes the previous version, live in about 2 minutes. Call again to keep stepping back through earlier changes.",
      inputSchema: {},
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: true },
    },
    guarded("revert_last_edit", async () => {
      const stack = (await deps.state.getJSON<EditEntry[]>(STACK_KEY)) ?? [];
      const idx = stack.map((e, i) => ({ e, i })).reverse()
        .find(({ e }) => e.type === "edit" && !e.reverted)?.i;
      if (idx === undefined)
        return fail("There's nothing to undo — no changes made through this editor are on record. If something on the site looks wrong, text Omar.");
      const entry = stack[idx];
      if (!entry.prevKey)
        return fail("The previous version of that page wasn't saved, so it can't be auto-reverted. Text Omar.");
      const prev = await deps.state.getText(entry.prevKey);
      if (prev === null)
        return fail("The saved previous version has expired. Text Omar to restore it.");

      const gate = await commitGate();
      if (gate) return fail(gate);

      const current = await getFile(entry.path);
      if (current.sha !== entry.newFileSha)
        return fail(
          "That page has been updated again (outside this editor) since the change you're undoing. Reverting automatically could wipe that newer work — text Omar to untangle it."
        );

      const contentB64 =
        entry.kind === "image" ? prev : Buffer.from(prev, "utf8").toString("base64");
      const message = commitMessage(`revert "${entry.message.replace(config.commitPrefix, "").trim()}"`);
      const commit = await putFile(entry.path, contentB64, message, current.sha);
      stack[idx] = { ...entry, reverted: true };
      stack.push({
        type: "revert",
        kind: entry.kind,
        page: entry.page,
        path: entry.path,
        message,
        commitSha: commit.commitSha,
        commitUrl: commit.commitUrl,
        newFileSha: commit.newFileSha,
        ts: new Date().toISOString(),
      });
      await deps.state.setJSON(STACK_KEY, stack.slice(-STACK_MAX));
      await audit(deps.state, {
        ts: new Date().toISOString(),
        tool: "revert_last_edit",
        page: entry.page,
        ok: true,
        summary: `reverted: ${entry.message}`,
        commit: commit.commitSha,
      });
      return ok(
        `Undone — "${entry.message.replace(config.commitPrefix, "").trim()}" was reverted and the previous version is republishing now (${config.deployNote}). Call revert_last_edit again to step back one more change.`,
        { reverted: entry.commitSha, commit: commit.commitSha }
      );
    })
  );

  return server;
}
