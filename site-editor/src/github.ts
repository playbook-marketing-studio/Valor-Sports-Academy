/**
 * Minimal GitHub Contents API client. The token is a fine-grained PAT scoped
 * to the one client repo, contents read/write, held server-side only.
 */
import { config } from "./config.js";

const API = "https://api.github.com";

export interface RepoFile {
  path: string;
  sha: string;
  contentB64: string;
  text: string;
}

export interface CommitResult {
  commitSha: string;
  commitUrl: string;
  newFileSha: string;
}

function headers(): Record<string, string> {
  const h: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "valor-site-editor",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const token = process.env.GITHUB_TOKEN;
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export class GitHubError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

async function gh(path: string, init?: RequestInit): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...headers(), ...(init?.headers ?? {}) },
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    if (res.status === 401 || res.status === 403)
      throw new GitHubError(
        "The site's publishing credential is missing or expired. Nothing was changed. Text Omar to fix it.",
        res.status
      );
    if (res.status === 404)
      throw new GitHubError("File not found in the site.", 404);
    if (res.status === 409)
      throw new GitHubError(
        "The site changed while this edit was in flight. Propose the change again.",
        409
      );
    throw new GitHubError(
      `Site storage request failed (${res.status}). ${body.slice(0, 200)}`,
      res.status
    );
  }
  return res.json();
}

export async function getFile(path: string, ref?: string): Promise<RepoFile> {
  const q = ref ? `?ref=${encodeURIComponent(ref)}` : `?ref=${config.branch}`;
  const data = await gh(
    `/repos/${config.repo}/contents/${encodePath(path)}${q}`
  );
  const contentB64 = (data.content as string).replace(/\n/g, "");
  return {
    path,
    sha: data.sha,
    contentB64,
    text: Buffer.from(contentB64, "base64").toString("utf8"),
  };
}

export async function putFile(
  path: string,
  contentB64: string,
  message: string,
  currentSha: string
): Promise<CommitResult> {
  const data = await gh(
    `/repos/${config.repo}/contents/${encodePath(path)}`,
    {
      method: "PUT",
      body: JSON.stringify({
        message,
        content: contentB64,
        sha: currentSha,
        branch: config.branch,
        committer: config.commitAuthor,
        author: config.commitAuthor,
      }),
    }
  );
  return {
    commitSha: data.commit.sha,
    commitUrl: data.commit.html_url,
    newFileSha: data.content.sha,
  };
}

function encodePath(p: string): string {
  return p.split("/").map(encodeURIComponent).join("/");
}

export function commitMessage(summary: string): string {
  const clean = summary.replace(/\s+/g, " ").trim().slice(0, 120);
  return `${config.commitPrefix} ${clean}`;
}
