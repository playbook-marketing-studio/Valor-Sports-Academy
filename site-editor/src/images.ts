/**
 * Image acquisition + server-side resize.
 *
 * Resizing uses the Netlify Image CDN of the live site instead of a native
 * module: the uploaded image is parked in a temp blob served at
 * /mcp-temp/<uuid>, the CDN transforms it to the old image's exact
 * dimensions/format, and the transformed bytes are committed.
 */
import { imageSize } from "image-size";
import { randomUUID } from "node:crypto";
import { config, ImageEntry } from "./config.js";
import { KV } from "./store.js";

const FORMAT_META: Record<ImageEntry["format"], { fm: string; mime: string }> = {
  webp: { fm: "webp", mime: "image/webp" },
  jpg: { fm: "jpg", mime: "image/jpeg" },
  png: { fm: "png", mime: "image/png" },
};

export interface ResolvedImage {
  name: string;
  entry: ImageEntry;
}

/** Match a plain-English description against the config image map. */
export function resolveImage(
  description: string,
  page?: string
): { match: ResolvedImage } | { candidates: ResolvedImage[] } {
  const tokens = description
    .toLowerCase()
    .split(/[^a-z0-9']+/)
    .filter((t) => t.length > 2 && !["the", "photo", "image", "picture", "one"].includes(t));
  const scored = Object.entries(config.images).map(([name, entry]) => {
    const hay = `${name} ${entry.path} ${entry.note ?? ""}`.toLowerCase();
    let score = tokens.filter((t) => hay.includes(t)).length;
    if (page && entry.pages.some((p) => p.toLowerCase() === page.toLowerCase())) {
      score += 1;
    }
    return { name, entry, score };
  });
  const max = Math.max(...scored.map((s) => s.score));
  const winners = scored.filter((s) => s.score === max && max > 0);
  if (winners.length === 1) return { match: winners[0] };
  const pool = page
    ? scored.filter((s) => s.entry.pages.some((p) => p.toLowerCase() === page.toLowerCase()))
    : scored;
  return { candidates: (winners.length > 1 ? winners : pool).map(({ name, entry }) => ({ name, entry })) };
}

export interface AcquiredImage {
  bytes: Uint8Array;
  width: number;
  height: number;
  type: string;
}

/** Accepts a data-URI / raw base64 string or an http(s) URL. */
export async function acquireImage(input: string): Promise<AcquiredImage> {
  let bytes: Uint8Array;
  const trimmed = input.trim();
  if (/^https?:\/\//i.test(trimmed)) {
    const res = await fetch(trimmed, {
      signal: AbortSignal.timeout(15000),
      headers: { "User-Agent": "valor-site-editor" },
    });
    if (!res.ok) throw new Error(`Could not download the image (HTTP ${res.status}).`);
    const buf = await res.arrayBuffer();
    bytes = new Uint8Array(buf);
  } else {
    const b64 = trimmed.replace(/^data:[^;]+;base64,/, "").replace(/\s/g, "");
    bytes = new Uint8Array(Buffer.from(b64, "base64"));
  }
  if (bytes.length === 0) throw new Error("The image was empty.");
  if (bytes.length > config.limits.maxImageBytes)
    throw new Error(
      `The image is too large (${(bytes.length / 1e6).toFixed(1)}MB, limit ${
        config.limits.maxImageBytes / 1e6
      }MB). Send a smaller file or a URL.`
    );
  let dims;
  try {
    dims = imageSize(bytes);
  } catch {
    throw new Error("That doesn't look like a valid image file (expected JPEG, PNG or WebP).");
  }
  if (!dims.width || !dims.height) throw new Error("Could not read the image dimensions.");
  return { bytes, width: dims.width, height: dims.height, type: dims.type ?? "unknown" };
}

/**
 * Resize/convert via the live site's Image CDN so the committed file matches
 * the old image's exact dimensions and format.
 */
export async function resizeToMatch(
  tmpStore: KV,
  img: AcquiredImage,
  target: ImageEntry
): Promise<Uint8Array> {
  const sameFormat =
    (img.type === "webp" && target.format === "webp") ||
    (img.type === "jpg" && target.format === "jpg") ||
    (img.type === "png" && target.format === "png");
  if (img.width === target.width && img.height === target.height && sameFormat) {
    return img.bytes; // already a drop-in replacement
  }
  const id = randomUUID();
  const key = `tmp-images/${id}`;
  const srcMime =
    img.type === "png" ? "image/png" : img.type === "webp" ? "image/webp" : "image/jpeg";
  await tmpStore.setBytes(key, img.bytes, srcMime);
  try {
    const meta = FORMAT_META[target.format];
    const srcUrl = `${config.siteUrl}/mcp-temp/${id}`;
    const cdnUrl =
      `${config.siteUrl}/.netlify/images?url=${encodeURIComponent(srcUrl)}` +
      `&w=${target.width}&h=${target.height}&fit=cover&fm=${meta.fm}&q=82`;
    const res = await fetch(cdnUrl, { signal: AbortSignal.timeout(25000) });
    if (!res.ok)
      throw new Error(
        `The image resizer returned HTTP ${res.status}. Nothing was changed. Try again, or text Omar.`
      );
    const out = new Uint8Array(await res.arrayBuffer());
    const check = imageSize(out);
    if (check.width !== target.width || check.height !== target.height)
      throw new Error(
        `Resize produced ${check.width}x${check.height} instead of ${target.width}x${target.height}. Nothing was changed. Text Omar.`
      );
    return out;
  } finally {
    await tmpStore.delete(key).catch(() => {});
  }
}

export function mimeFor(format: ImageEntry["format"]): string {
  return FORMAT_META[format].mime;
}
