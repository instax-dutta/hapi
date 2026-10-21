/**
 * The Hugging Face Hub client.
 *
 * One place that knows how to talk to the Hub: pagination, expansions,
 * timeouts, retries and the README fetch. A second place that forgets the
 * timeout is how a crawl wedges.
 *
 * The client is used by the offline pipeline and by the one endpoint that
 * fetches during a request, `GET /v1/parse`.
 */
import type { RawRepo } from "../core/types.ts";

export const HF_BASE = "https://huggingface.co";

/** The expansions the directory needs. One list, used by every listing. */
export const DISCOVERY_EXPANDS = [
  "tags",
  "downloads",
  "downloadsAllTime",
  "likes",
  "gated",
  "pipeline_tag",
  "cardData",
  "baseModels",
  "safetensors",
  "createdAt",
  "lastModified",
  "sha",
  "siblings",
  "library_name",
] as const;

export interface HubModel {
  id: string;
  sha?: string;
  createdAt?: string;
  lastModified?: string;
  downloads?: number;
  downloadsAllTime?: number;
  likes?: number;
  gated?: boolean | string;
  pipeline_tag?: string | null;
  library_name?: string | null;
  tags?: string[];
  siblings?: { rfilename: string }[];
  safetensors?: { total?: number } | null;
  cardData?: Record<string, unknown> | null;
  baseModels?: { relation?: string; models?: { id: string }[] } | null;
}

export interface RequestOptions {
  token?: string;
  retries?: number;
  timeoutMs?: number;
  onRetry?: (url: string, attempt: number, status: number) => void;
  userAgent?: string;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Fetch a Hub URL with a bounded time and bounded retries.
 *
 * A 404, 401 or 403 is returned as-is: a missing README, a gated repo or a
 * private repo is a fact about the model, not a transport failure. A 429 or a
 * 5xx is retried with backoff.
 */
export async function hfFetch(
  url: string,
  options: RequestOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  const retries = options.retries ?? 4;
  const timeoutMs = options.timeoutMs ?? 45_000;
  const headers: Record<string, string> = {
    "User-Agent": options.userAgent ?? "hapi-heretic-api",
  };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;

  let lastError: unknown = new Error(`Failed to fetch ${url}`);
  for (let attempt = 0; attempt < retries; attempt += 1) {
    try {
      const response = await fetchImpl(url, {
        headers,
        // A stalled TLS connection must never wedge a worker forever.
        signal: AbortSignal.timeout(timeoutMs),
      });
      if (response.status === 404 || response.status === 401 || response.status === 403) {
        return response;
      }
      if (response.status === 429 || response.status >= 500) {
        lastError = new Error(`HF ${response.status} for ${url}`);
        if (attempt === retries - 1) break;
        options.onRetry?.(url, attempt + 1, response.status);
        const retryAfter = Number(response.headers.get("retry-after") ?? "0");
        await sleep(
          Math.min(retryAfter > 0 ? retryAfter * 1000 : 1000 * 3 ** attempt, 30_000),
        );
        continue;
      }
      if (!response.ok) throw new Error(`HF ${response.status} for ${url}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt === retries - 1) break;
      options.onRetry?.(url, attempt + 1, 0);
      await sleep(1000 * 2 ** attempt);
    }
  }
  throw lastError;
}

function expandQuery(expands: readonly string[]): string {
  return expands.map((e) => `expand[]=${encodeURIComponent(e)}`).join("&");
}

export interface ListOptions extends RequestOptions {
  maxPages?: number;
  onPage?: (count: number, url: string) => void;
  fetchImpl?: typeof fetch;
}

/**
 * Walk a model listing to the end.
 *
 * The page cap is a hard stop. A silent truncation would understate every
 * total derived from the listing.
 */
export async function listAllModels(
  query: Record<string, string>,
  options: ListOptions = {},
): Promise<HubModel[]> {
  const out: HubModel[] = [];
  const seen = new Set<string>();
  const maxPages = options.maxPages ?? 40;
  const fetchImpl = options.fetchImpl ?? fetch;
  let url: string | null =
    `${HF_BASE}/api/models?` +
    new URLSearchParams({
      ...query,
      limit: "1000",
      direction: "-1",
      sort: "downloads",
    }).toString() +
    `&${expandQuery(DISCOVERY_EXPANDS)}`;

  for (let page = 0; page < maxPages && url; page += 1) {
    const response = await hfFetch(url, options, fetchImpl);
    if (response.status === 404) break;
    const batch = (await response.json()) as HubModel[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    for (const model of batch) {
      if (!model.id || seen.has(model.id)) continue;
      seen.add(model.id);
      out.push(model);
    }
    options.onPage?.(out.length, url);

    const link = response.headers.get("link") ?? "";
    const next = link.match(/<([^>]+)>;\s*rel="next"/);
    url = next ? next[1] : null;
  }

  return out;
}

export interface HFRawModel extends HubModel {
  /** Which discovery pass found it first. */
  discoveredBy: "tag" | "name";
}

export interface Discovery {
  tagged: HubModel[];
  named: HubModel[];
  merged: HFRawModel[];
}

/**
 * Two-pass discovery with the tagged pass taking precedence.
 *
 * The tag is a deliberate signal. A name match can be incidental, so a repo
 * found by both is credited to the tag.
 */
export async function discoverHereticModels(options: ListOptions = {}): Promise<Discovery> {
  const tagged = await listAllModels({ filter: "heretic" }, options);
  const taggedIds = new Set(tagged.map((m) => m.id));
  const named = await listAllModels({ search: "heretic" }, options);

  const merged: HFRawModel[] = [];
  for (const model of tagged) merged.push({ ...model, discoveredBy: "tag" });
  for (const model of named) {
    if (taggedIds.has(model.id)) continue;
    merged.push({ ...model, discoveredBy: "name" });
  }

  return { tagged, named, merged };
}

/** The README text of a repository, or null when there is none. */
export async function fetchReadme(
  id: string,
  options: RequestOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  for (const name of ["README.md", "readme.md"]) {
    const response = await hfFetch(`${HF_BASE}/${id}/raw/main/${name}`, options, fetchImpl);
    if (response.ok) {
      const text = await response.text();
      // The Hub serves an HTML error page with a 200 in some edge cases.
      if (text.trimStart().startsWith("<!doctype html")) continue;
      return text;
    }
  }
  return null;
}

/** The metadata of one repository. */
export async function fetchModel(
  id: string,
  options: RequestOptions = {},
  fetchImpl: typeof fetch = fetch,
): Promise<HubModel | null> {
  const url = `${HF_BASE}/api/models/${id}?${expandQuery(DISCOVERY_EXPANDS)}`;
  const response = await hfFetch(url, options, fetchImpl);
  if (response.status === 404) return null;
  if (!response.ok) return null;
  const body = (await response.json()) as HubModel;
  return body && typeof body === "object" ? body : null;
}

/** A repository id, as the Hub spells it: `owner/name`. */
const REPO_ID_PATTERN = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;

export function isValidRepoId(value: string): boolean {
  return REPO_ID_PATTERN.test(value);
}

/**
 * Reduce a Hub listing to the fields the directory keeps.
 *
 * The declared base models come from two places: the `baseModels` expansion
 * and the card's own `base_model`. The card may be a string or a list.
 */
export function toRawRepo(model: HubModel): RawRepo {
  const cardData = model.cardData ?? {};
  const cardBase = cardData.base_model;
  const declared = [
    ...((model.baseModels?.models ?? []).map((m) => m.id) ?? []),
    ...(typeof cardBase === "string"
      ? [cardBase]
      : Array.isArray(cardBase)
        ? cardBase.filter((v): v is string => typeof v === "string")
        : []),
  ];

  const files = (model.siblings ?? []).map((s) => s.rfilename);

  return {
    id: model.id,
    author: model.id.split("/")[0] ?? "unknown",
    sha: model.sha ?? "",
    createdAt: model.createdAt ?? "",
    lastModified: model.lastModified ?? "",
    downloads30d: model.downloads ?? 0,
    downloadsAllTime: model.downloadsAllTime ?? 0,
    likes: model.likes ?? 0,
    tags: model.tags ?? [],
    // The Hub sends a boolean, but the type allows a string. The string
    // "false" is false, not true.
    gated:
      model.gated === true ||
      (typeof model.gated === "string" && model.gated !== "false"),
    pipelineTag: model.pipeline_tag ?? null,
    libraryName: model.library_name ?? null,
    declaredBaseModels: [...new Set(declared)],
    cardBaseModel: typeof cardBase === "string" ? cardBase : null,
    cardQuantizedBy: typeof cardData.quantized_by === "string" ? cardData.quantized_by : null,
    safetensorsTotal: model.safetensors?.total ?? null,
    files,
    license: typeof cardData.license === "string" ? cardData.license : null,
  };
}
