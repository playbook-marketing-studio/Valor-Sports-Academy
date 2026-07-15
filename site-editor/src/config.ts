import rawConfig from "../site.config.json";

export interface PageEntry {
  path: string;
  description: string;
}

export interface ImageEntry {
  path: string;
  width: number;
  height: number;
  format: "webp" | "jpg" | "png";
  pages: string[];
  note?: string;
}

export interface SharedTextEntry {
  label: string;
  pattern: string;
  note: string;
}

export interface SiteConfig {
  client: string;
  serverName: string;
  repo: string;
  branch: string;
  siteUrl: string;
  commitPrefix: string;
  commitAuthor: { name: string; email: string };
  deployNote: string;
  limits: {
    callsPerHour: number;
    commitsPerHour: number;
    maxDiffChars: number;
    proposalTtlMinutes: number;
    maxImageBytes: number;
  };
  slogans: string[];
  pages: Record<string, PageEntry>;
  images: Record<string, ImageEntry>;
  protectedPaths: string[];
  sharedText: SharedTextEntry[];
}

export const config = rawConfig as SiteConfig;

/** Resolve a friendly page name (case-insensitive, unique-substring tolerant). */
export function resolvePage(
  name: string
): { page: string; entry: PageEntry } | { error: string } {
  const wanted = name.trim().toLowerCase();
  const names = Object.keys(config.pages);
  const exact = names.find((n) => n.toLowerCase() === wanted);
  if (exact) return { page: exact, entry: config.pages[exact] };
  const partial = names.filter((n) => n.toLowerCase().includes(wanted));
  if (partial.length === 1)
    return { page: partial[0], entry: config.pages[partial[0]] };
  const list = names.map((n) => `"${n}"`).join(", ");
  if (partial.length > 1)
    return {
      error: `"${name}" matches several pages (${partial
        .map((n) => `"${n}"`)
        .join(", ")}). Use the exact page name. All pages: ${list}`,
    };
  return {
    error: `Unknown page "${name}". This tool can only edit the client-facing pages. Valid pages: ${list}. If the change is somewhere else, route it to Omar.`,
  };
}

/** Never allow edits to land on a protected path, even via a mis-set page entry. */
export function isProtectedPath(path: string): boolean {
  const p = path.replace(/^\/+/, "");
  return config.protectedPaths.some((pp) =>
    pp.endsWith("/") ? p.startsWith(pp) : p === pp
  );
}

/** Shared-text hints: if the edit touches a value that repeats across pages, say so. */
export function sharedTextHints(find: string, matchContext: string): string[] {
  const hints: string[] = [];
  for (const s of config.sharedText) {
    if (find.includes(s.pattern) || matchContext.includes(s.pattern)) {
      hints.push(
        `${s.note} If the ${s.label} is changing, make the same change on the other pages too (use get_page_content on each page to find it).`
      );
    }
  }
  return hints;
}
