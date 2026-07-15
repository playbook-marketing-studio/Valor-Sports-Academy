/**
 * Small KV abstraction over Netlify Blobs, with a file-backed fallback so the
 * whole server can run in-process for local tests (set SITE_EDITOR_LOCAL_STORE
 * to a directory path). Production always uses Netlify Blobs (strong reads).
 */
import { getStore } from "@netlify/blobs";
import { promises as fs } from "node:fs";
import path from "node:path";

export interface KV {
  getJSON<T>(key: string): Promise<T | null>;
  setJSON(key: string, value: unknown): Promise<void>;
  getText(key: string): Promise<string | null>;
  setText(key: string, value: string): Promise<void>;
  getBytes(key: string): Promise<Uint8Array | null>;
  setBytes(key: string, value: Uint8Array, contentType?: string): Promise<void>;
  getContentType(key: string): Promise<string | null>;
  delete(key: string): Promise<void>;
}

class BlobsKV implements KV {
  private store;
  constructor(name: string) {
    this.store = getStore({ name, consistency: "strong" });
  }
  async getJSON<T>(key: string): Promise<T | null> {
    return ((await this.store.get(key, { type: "json" })) as T) ?? null;
  }
  async setJSON(key: string, value: unknown): Promise<void> {
    await this.store.setJSON(key, value);
  }
  async getText(key: string): Promise<string | null> {
    return (await this.store.get(key, { type: "text" })) ?? null;
  }
  async setText(key: string, value: string): Promise<void> {
    await this.store.set(key, value);
  }
  async getBytes(key: string): Promise<Uint8Array | null> {
    const buf = await this.store.get(key, { type: "arrayBuffer" });
    return buf ? new Uint8Array(buf) : null;
  }
  async setBytes(key: string, value: Uint8Array, contentType?: string): Promise<void> {
    // Pass a fresh ArrayBuffer copy: Blobs rejects SharedArrayBuffer-backed views.
    const copy = new Uint8Array(value).buffer as ArrayBuffer;
    await this.store.set(key, copy, contentType ? { metadata: { contentType } } : undefined);
  }
  async getContentType(key: string): Promise<string | null> {
    const meta = await this.store.getMetadata(key);
    return (meta?.metadata?.contentType as string) ?? null;
  }
  async delete(key: string): Promise<void> {
    await this.store.delete(key);
  }
}

class FileKV implements KV {
  constructor(private dir: string) {}
  private file(key: string): string {
    return path.join(this.dir, key.replace(/[^a-zA-Z0-9._-]/g, "_"));
  }
  private async read(key: string): Promise<Buffer | null> {
    try {
      return await fs.readFile(this.file(key));
    } catch {
      return null;
    }
  }
  private async write(key: string, data: Uint8Array | string): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true });
    await fs.writeFile(this.file(key), data);
  }
  async getJSON<T>(key: string): Promise<T | null> {
    const b = await this.read(key);
    return b ? (JSON.parse(b.toString("utf8")) as T) : null;
  }
  async setJSON(key: string, value: unknown): Promise<void> {
    await this.write(key, JSON.stringify(value));
  }
  async getText(key: string): Promise<string | null> {
    const b = await this.read(key);
    return b ? b.toString("utf8") : null;
  }
  async setText(key: string, value: string): Promise<void> {
    await this.write(key, value);
  }
  async getBytes(key: string): Promise<Uint8Array | null> {
    const b = await this.read(key);
    return b ? new Uint8Array(b) : null;
  }
  async setBytes(key: string, value: Uint8Array, contentType?: string): Promise<void> {
    await this.write(key, value);
    if (contentType) await this.write(`${key}.meta`, JSON.stringify({ contentType }));
  }
  async getContentType(key: string): Promise<string | null> {
    const meta = await this.getJSON<{ contentType: string }>(`${key}.meta`);
    return meta?.contentType ?? null;
  }
  async delete(key: string): Promise<void> {
    try {
      await fs.unlink(this.file(key));
    } catch {
      /* already gone */
    }
  }
}

export function openStore(name: string): KV {
  const localDir = process.env.SITE_EDITOR_LOCAL_STORE;
  if (localDir) return new FileKV(path.join(localDir, name));
  return new BlobsKV(name);
}

// ---------------------------------------------------------------------------
// Rate limiting — fixed hourly window per key hash.
// ---------------------------------------------------------------------------

interface RateWindow {
  calls: number;
  commits: number;
}

function hourWindow(): string {
  return new Date().toISOString().slice(0, 13); // e.g. 2026-07-15T21
}

export async function bumpRate(
  kv: KV,
  keyHash: string,
  kind: "call" | "commit",
  limits: { callsPerHour: number; commitsPerHour: number }
): Promise<{ ok: true } | { ok: false; message: string }> {
  const key = `ratelimit/${keyHash}/${hourWindow()}`;
  const w = (await kv.getJSON<RateWindow>(key)) ?? { calls: 0, commits: 0 };
  if (kind === "call" && w.calls >= limits.callsPerHour)
    return {
      ok: false,
      message: `Rate limit reached (${limits.callsPerHour} calls per hour). Try again in the next hour, or text Omar if this is urgent.`,
    };
  if (kind === "commit" && w.commits >= limits.commitsPerHour)
    return {
      ok: false,
      message: `Edit limit reached (${limits.commitsPerHour} published changes per hour). This is a safety cap. Try again in the next hour, or text Omar if this is urgent.`,
    };
  if (kind === "call") w.calls += 1;
  else w.commits += 1;
  await kv.setJSON(key, w);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Audit log — append-only JSONL, one file per month.
// ---------------------------------------------------------------------------

export interface AuditEntry {
  ts: string;
  tool: string;
  page?: string;
  ok: boolean;
  summary: string;
  commit?: string;
}

export async function audit(kv: KV, entry: AuditEntry): Promise<void> {
  const key = `audit/${entry.ts.slice(0, 7)}.jsonl`;
  const existing = (await kv.getText(key)) ?? "";
  await kv.setText(key, existing + JSON.stringify(entry) + "\n");
  console.log("site-editor-audit", JSON.stringify(entry));
}
