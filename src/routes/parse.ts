/**
 * The live card parsing endpoint.
 *
 * The one endpoint that reaches the Hub during a request. It fetches exactly
 * one model card and returns what the parser found, including the evidence
 * snippet, so a client can check the numbers against the source.
 *
 * It never returns a metric the card does not publish.
 */
import { parseCard } from "../core/card.ts";
import type { ParsedCard } from "../core/types.ts";
import { errorResponse, json } from "../lib/http.ts";
import { fetchModel, fetchReadme, isValidRepoId } from "../lib/hf.ts";
import type { RouteContext, RouteDeps } from "../router.ts";

/**
 * The parse cache.
 *
 * The endpoint is the only one that reaches the Hub during a request, so it
 * must not reach it twice for the same card. An isolate keeps the last
 * parses, and a repeated request for one of them is served from memory.
 */
const PARSE_CACHE_TTL_MS = 10 * 60 * 1000;
const PARSE_CACHE_MAX = 200;
const parseCache = new Map<string, { parsed: ParsedCard; fetchedAt: string }>();

function cachedParse(id: string): { parsed: ParsedCard; fetchedAt: string } | null {
  const hit = parseCache.get(id);
  if (!hit) return null;
  if (Date.now() - Date.parse(hit.fetchedAt) > PARSE_CACHE_TTL_MS) {
    parseCache.delete(id);
    return null;
  }
  parseCache.delete(id);
  parseCache.set(id, hit);
  return hit;
}

function rememberParse(id: string, parsed: ParsedCard, fetchedAt: string): void {
  parseCache.set(id, { parsed, fetchedAt });
  while (parseCache.size > PARSE_CACHE_MAX) {
    const oldest = parseCache.keys().next();
    if (oldest.done) break;
    parseCache.delete(oldest.value);
  }
}

export async function parseRepo(context: RouteContext, deps: RouteDeps): Promise<Response> {
  const raw = (context.query.get("repo") ?? "").trim();
  if (!raw) {
    return errorResponse(400, "bad_request", "Give a `repo` as `owner/name`.");
  }
  if (!isValidRepoId(raw)) {
    return errorResponse(
      400,
      "bad_request",
      "A repository id looks like `owner/name`, with letters, digits, dots, dashes and underscores.",
    );
  }

  const fromCache = cachedParse(raw);
  if (fromCache) {
    return json(
      {
        repo: raw,
        url: `https://huggingface.co/${raw}`,
        fetchedAt: fromCache.fetchedAt,
        cached: true,
        parsed: fromCache.parsed,
      },
      { cache: "parse" },
    );
  }

  const fetchImpl = deps.fetchImpl;
  let markdown: string | null;
  let meta = null;
  try {
    [markdown, meta] = await Promise.all([
      fetchReadme(raw, { retries: 2, timeoutMs: 20_000 }, fetchImpl),
      fetchModel(raw, { retries: 2, timeoutMs: 20_000 }, fetchImpl),
    ]);
  } catch (error) {
    // The upstream message is logged, never sent. A client learns that the Hub
    // is unavailable, not how the Hub failed.
    console.error("hapi: /v1/parse upstream failure", error);
    return errorResponse(
      502,
      "upstream_unavailable",
      "Hugging Face is temporarily unavailable. Try again in a moment.",
    );
  }

  if (markdown === null) {
    return errorResponse(404, "not_found", `No model card was found for "${raw}".`);
  }

  const declaredBaseModels = Array.isArray(meta?.baseModels?.models)
    ? meta.baseModels.models.map((entry) => entry.id)
    : [];

  const parsed = parseCard(markdown, { selfId: raw, declaredBaseModels });
  const fetchedAt = new Date().toISOString();
  rememberParse(raw, parsed, fetchedAt);

  return json(
    {
      repo: raw,
      url: `https://huggingface.co/${raw}`,
      fetchedAt,
      cached: false,
      meta: meta
        ? {
            downloads30d: meta.downloads ?? 0,
            downloadsAllTime: meta.downloadsAllTime ?? 0,
            likes: meta.likes ?? 0,
            tags: meta.tags ?? [],
            lastModified: meta.lastModified ?? null,
            sha: meta.sha ?? null,
          }
        : null,
      parsed,
    },
    { cache: "parse" },
  );
}
