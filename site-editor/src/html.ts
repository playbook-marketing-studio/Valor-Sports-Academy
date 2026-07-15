/**
 * HTML source analysis: protected regions, client-readable text extraction,
 * exact-match location, near-match recovery, and slogan protection.
 *
 * Design constraint: propose_text_change matches against the RAW page source,
 * so extraction must show text-node content verbatim (entities included).
 */
import { config } from "./config.js";

export interface Span {
  start: number;
  end: number;
  kind: "head" | "script" | "style" | "form" | "nav" | "comment";
}

const REGION_LABELS: Record<Span["kind"], string> = {
  head: "page settings and tracking (the page <head>)",
  script: "tracking or page code",
  style: "styling code",
  form: "a form (forms are locked so sign-ups keep working)",
  nav: "the navigation menu",
  comment: "a hidden note in the page code",
};

export function regionLabel(kind: Span["kind"]): string {
  return REGION_LABELS[kind];
}

/** Spans of the source that must never be edited through this server. */
export function protectedSpans(src: string): Span[] {
  const spans: Span[] = [];
  const push = (re: RegExp, kind: Span["kind"]) => {
    for (const m of src.matchAll(re)) {
      spans.push({ start: m.index!, end: m.index! + m[0].length, kind });
    }
  };
  push(/<!--[\s\S]*?-->/g, "comment");
  push(/<head\b[\s\S]*?<\/head\s*>/gi, "head");
  push(/<script\b[\s\S]*?<\/script\s*>/gi, "script");
  push(/<style\b[\s\S]*?<\/style\s*>/gi, "style");
  push(/<form\b[\s\S]*?<\/form\s*>/gi, "form");
  push(/<nav\b[\s\S]*?<\/nav\s*>/gi, "nav");
  return spans.sort((a, b) => a.start - b.start);
}

export function spanAt(spans: Span[], start: number, end: number): Span | null {
  return spans.find((s) => start < s.end && end > s.start) ?? null;
}

const BLOCK_TAGS =
  /^(p|div|section|article|header|footer|main|ul|ol|li|h[1-6]|br|hr|table|tr|td|th|blockquote|figure|figcaption|details|summary)$/i;

/**
 * Client-readable extraction. Text nodes are kept VERBATIM (entities and all)
 * so a `find` string copied from the extraction matches the raw source.
 * Head/script/style/comment content is dropped entirely.
 */
export function extractText(src: string): string {
  let out = "";
  const drop = protectedSpans(src).filter(
    (s) => s.kind === "head" || s.kind === "script" || s.kind === "style" || s.kind === "comment"
  );
  let i = 0;
  while (i < src.length) {
    const span = drop.find((s) => s.start <= i && i < s.end);
    if (span) {
      i = span.end;
      continue;
    }
    const ch = src[i];
    if (ch === "<") {
      const close = src.indexOf(">", i);
      if (close === -1) break;
      const tag = /^<\/?\s*([a-zA-Z0-9]+)/.exec(src.slice(i, close + 1));
      if (tag && BLOCK_TAGS.test(tag[1])) out += "\n";
      i = close + 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  // Tidy purely-structural whitespace without touching in-line text.
  return out
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** All raw-source match positions of `find`. */
export function findMatches(src: string, find: string): number[] {
  const out: number[] = [];
  let idx = src.indexOf(find);
  while (idx !== -1) {
    out.push(idx);
    idx = src.indexOf(find, idx + 1);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Normalized scanning (tags stripped, entities decoded, whitespace collapsed,
// lowercased) with a map back to raw source indices.
// ---------------------------------------------------------------------------

const ENTITIES: Record<string, string> = {
  "&ndash;": "–",
  "&mdash;": "—",
  "&middot;": "·",
  "&amp;": "&",
  "&nbsp;": " ",
  "&rsquo;": "’",
  "&lsquo;": "‘",
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&hellip;": "…",
  "&copy;": "©",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

interface Normalized {
  text: string;
  rawIndex: number[]; // rawIndex[i] = raw offset of normalized char i
}

function normalizeScan(src: string, stripTags: boolean): Normalized {
  let text = "";
  const rawIndex: number[] = [];
  let i = 0;
  let lastWasSpace = true;
  const emit = (ch: string, at: number) => {
    if (/\s/.test(ch)) {
      if (lastWasSpace) return;
      text += " ";
      rawIndex.push(at);
      lastWasSpace = true;
      return;
    }
    text += ch.toLowerCase();
    rawIndex.push(at);
    lastWasSpace = false;
  };
  while (i < src.length) {
    if (stripTags && src[i] === "<") {
      const close = src.indexOf(">", i);
      if (close === -1) break;
      emit(" ", i); // tag boundary acts as whitespace
      i = close + 1;
      continue;
    }
    if (src[i] === "&") {
      const ent = Object.keys(ENTITIES).find((e) => src.startsWith(e, i));
      if (ent) {
        emit(ENTITIES[ent], i);
        i += ent.length;
        continue;
      }
    }
    emit(src[i], i);
    i += 1;
  }
  return { text, rawIndex };
}

export function normalizePhrase(s: string): string {
  let out = "";
  let i = 0;
  let lastWasSpace = true;
  while (i < s.length) {
    if (s[i] === "&") {
      const ent = Object.keys(ENTITIES).find((e) => s.startsWith(e, i));
      if (ent) {
        const ch = ENTITIES[ent];
        if (/\s/.test(ch)) {
          if (!lastWasSpace) {
            out += " ";
            lastWasSpace = true;
          }
        } else {
          out += ch.toLowerCase();
          lastWasSpace = false;
        }
        i += ent.length;
        continue;
      }
    }
    if (/\s/.test(s[i])) {
      if (!lastWasSpace) {
        out += " ";
        lastWasSpace = true;
      }
    } else {
      out += s[i].toLowerCase();
      lastWasSpace = false;
    }
    i += 1;
  }
  return out.trim();
}

/**
 * When an exact find fails, look for the text with entities/whitespace/tags
 * normalized and return the RAW source fragment so the caller can retry with
 * an exact string.
 */
export function nearMatch(src: string, find: string): string | null {
  const wanted = normalizePhrase(find);
  if (!wanted) return null;
  for (const stripTags of [false, true]) {
    const norm = normalizeScan(src, stripTags);
    const at = norm.text.indexOf(wanted);
    if (at !== -1) {
      const rawStart = norm.rawIndex[at];
      const rawEnd =
        at + wanted.length < norm.rawIndex.length
          ? norm.rawIndex[at + wanted.length]
          : src.length;
      const pad = 40;
      return src.slice(Math.max(0, rawStart - pad), Math.min(src.length, rawEnd + pad));
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Slogan protection
// ---------------------------------------------------------------------------

/** Count intact occurrences of each protected slogan phrase (markup-proof). */
export function sloganCounts(src: string): number[] {
  const { text } = normalizeScan(src, true);
  return config.slogans.map((phrase) => {
    const p = normalizePhrase(phrase);
    let n = 0;
    let idx = text.indexOf(p);
    while (idx !== -1) {
      n += 1;
      idx = text.indexOf(p, idx + 1);
    }
    return n;
  });
}

/** True if the proposed new source alters or removes any slogan occurrence. */
export function sloganViolated(oldSrc: string, newSrc: string): boolean {
  const before = sloganCounts(oldSrc);
  const after = sloganCounts(newSrc);
  return after.some((n, i) => n < before[i]);
}

/**
 * Detect a mangled/reversed slogan already live on a page: most slogan words
 * present close together, but the intact phrase missing.
 */
export function sloganHealthWarning(src: string): string | null {
  const { text } = normalizeScan(src, true);
  const problems: string[] = [];
  for (const phrase of config.slogans) {
    const p = normalizePhrase(phrase);
    if (text.includes(p)) continue;
    const words = p.split(" ").filter((w) => w.length > 2);
    const hits = words.filter((w) => text.includes(w));
    if (hits.length >= Math.max(2, words.length - 1)) {
      problems.push(`"${phrase}"`);
    }
  }
  if (!problems.length) return null;
  return `WARNING: the site slogan (${problems.join(
    " / "
  )}) looks altered or scrambled on this page. Tell the user, and text Omar to restore it. Do not edit around it.`;
}
