/**
 * The HTTP layer.
 *
 * One place owns CORS, the JSON envelope, the error shape, the cache policy
 * and conditional requests. Every response in the API goes through here, so a
 * route module never has to remember the rules.
 */
import type { ApiError } from "./types.ts";

export const API_VERSION = "0.1.0";
export const DOCS_URL = "https://hapi.sdad.pro/v1/openapi.json";

/** The cache policy per surface. Errors override all of it to `no-store`. */
export const CACHE = {
  meta: "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
  list: "public, max-age=300, s-maxage=600, stale-while-revalidate=3600",
  stats: "public, max-age=60, s-maxage=300, stale-while-revalidate=600",
  bulk: "public, max-age=300, s-maxage=3600, stale-while-revalidate=86400",
  parse: "public, max-age=300, s-maxage=3600",
  error: "no-store",
} as const;

export type CachePolicy = keyof typeof CACHE;

export function corsHeaders(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, If-None-Match",
    "Access-Control-Expose-Headers": "ETag",
    "Access-Control-Max-Age": "86400",
  };
}

/**
 * A cheap, stable content hash.
 *
 * The ETag only has to change when the body changes. A cryptographic digest
 * would be overkill and would add an async round trip per response.
 */
export function etagOf(text: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return `"${(hash >>> 0).toString(16).padStart(8, "0")}-${text.length.toString(16)}"`;
}

export interface JsonOptions {
  status?: number;
  cache?: CachePolicy;
  headers?: Record<string, string>;
}

/**
 * A JSON response.
 *
 * The body is serialized once and reused for the ETag, so a conditional
 * request never serializes twice.
 */
export function json(body: unknown, options: JsonOptions = {}): Response {
  const text = JSON.stringify(body);
  const headers = new Headers({
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": CACHE[options.cache ?? "list"],
    "X-Content-Type-Options": "nosniff",
    ...corsHeaders(),
    ...(options.headers ?? {}),
  });
  headers.set("ETag", etagOf(text));
  return new Response(text, { status: options.status ?? 200, headers });
}

export function errorResponse(
  status: number,
  code: string,
  message: string,
  headers: Record<string, string> = {},
): Response {
  const body: ApiError = {
    error: { status, code, message, docs: DOCS_URL },
  };
  const text = JSON.stringify(body);
  return new Response(text, {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": CACHE.error,
      "X-Content-Type-Options": "nosniff",
      ...corsHeaders(),
      ...headers,
    },
  });
}

/**
 * Answer a conditional request.
 *
 * `If-None-Match` matching turns the response into a bodyless 304. The cache
 * headers stay, so the client keeps its freshness window.
 */
export function applyConditional(request: Request, response: Response): Response {
  const etag = response.headers.get("ETag");
  if (!etag) return response;
  const requestEtag = request.headers.get("If-None-Match");
  if (!requestEtag) return response;
  // A weak validator matches a strong one. RFC 9110 asks for the weak
  // comparison, so `W/"abc"` has to match `"abc"`.
  const candidates = requestEtag.split(",").map((value) => value.trim().replace(/^W\//, ""));
  const strong = etag.replace(/^W\//, "");
  if (!candidates.includes(strong) && !candidates.includes("*")) return response;

  const headers = new Headers(response.headers);
  headers.delete("Content-Type");
  headers.delete("Content-Length");
  return new Response(null, { status: 304, headers });
}

/** A response with no body, for `OPTIONS`. */
export function emptyResponse(status: number, cache: CachePolicy = "meta"): Response {
  return new Response(null, {
    status,
    headers: {
      "Cache-Control": CACHE[cache],
      "X-Content-Type-Options": "nosniff",
      ...corsHeaders(),
    },
  });
}
