// Playbook AI tracker — runs at the edge on every page load. Captures AI bot
// crawls (which can't run JS) + human AI referrals, forwards to the dashboard,
// returns the page untouched. INGEST_KEY is injected by deploy.sh.
import type { Context } from "https://edge.netlify.com";

const CLIENT_SLUG = "valor";
const INGEST_URL = "https://jggwanbbfaygsjobzjcj.functions.supabase.co/ai-hit";
const INGEST_KEY = "9393504f45049665a37a69e00dc46c81";

const AI_BOTS =
  /(GPTBot|OAI-SearchBot|ChatGPT-User|ClaudeBot|anthropic-ai|Claude-Web|PerplexityBot|Perplexity-User|Google-Extended|Googlebot-Extended|CCBot|Bytespider|Amazonbot|cohere-ai|Applebot-Extended|Meta-ExternalAgent|DuckAssistBot)/i;
const AI_REFERRERS =
  /(chatgpt\.com|chat\.openai\.com|openai\.com|perplexity\.ai|claude\.ai|gemini\.google\.com|copilot\.microsoft\.com|deepseek\.com|grok\.com|x\.ai|meta\.ai|you\.com)/i;

export default async function handler(request: Request, context: Context) {
  const accept = request.headers.get("accept") || "";
  if (!accept.includes("text/html")) return; // only top-level page loads

  try {
    const ua = request.headers.get("user-agent") || "";
    const ref = request.headers.get("referer") || "";
    const url = new URL(request.url);
    let hit: Record<string, unknown> | null = null;

    const bot = ua.match(AI_BOTS);
    if (bot) {
      hit = { type: "crawl", ai_source: bot[1], user_agent: ua.slice(0, 500), path: url.pathname };
    } else if (AI_REFERRERS.test(ref)) {
      hit = { type: "referral", ai_source: new URL(ref).hostname.replace(/^www\./, ""), referrer: ref.slice(0, 500), path: url.pathname };
    }

    if (hit) {
      hit.client = CLIENT_SLUG;
      hit.country = context.geo?.country?.code ?? null;
      hit.ts = new Date().toISOString();
      context.waitUntil(
        fetch(INGEST_URL, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${INGEST_KEY}` },
          body: JSON.stringify(hit),
        }).catch(() => {}),
      );
    }
  } catch (_) { /* never break the page */ }

  return;
}
