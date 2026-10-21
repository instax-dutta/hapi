/**
 * The OpenAPI description and the bulk dataset dump.
 */
import { CACHE, corsHeaders, json } from "../lib/http.ts";
import { KEYS } from "../lib/store.ts";
import type { RouteContext, RouteDeps } from "../router.ts";
import { openapiDocument } from "./openapi-spec.ts";

export async function openapi(_context: RouteContext, _deps: RouteDeps): Promise<Response> {
  return json(openapiDocument, { cache: "meta" });
}

/**
 * The whole dataset, as the published bytes.
 *
 * The document is large and it is only downloaded, never understood by the
 * server. Parsing it and writing it back out would cost more than the
 * transfer, and the store's own validator is a better ETag than one computed
 * from the re-serialized text.
 */
export async function dataset(_context: RouteContext, deps: RouteDeps): Promise<Response> {
  const stored = await deps.dataset.raw(KEYS.dataset);
  return new Response(stored.text, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": CACHE.bulk,
      "X-Content-Type-Options": "nosniff",
      ...(stored.etag ? { ETag: stored.etag } : {}),
      ...corsHeaders(),
    },
  });
}
