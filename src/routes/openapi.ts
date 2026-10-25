/**
 * The OpenAPI description and the bulk dataset dump.
 */
import { CACHE, corsHeaders, etagOf, json } from "../lib/http.ts";
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
 *
 * The UTF-8 bytes are encoded once per dataset version. Re-encoding 14 MB on
 * every request was the most expensive part of this route.
 */
const encodedBulk = new WeakMap<object, { etag: string; bytes: Uint8Array<ArrayBuffer> }>();

export async function dataset(_context: RouteContext, deps: RouteDeps): Promise<Response> {
  const stored = await deps.dataset.raw(KEYS.dataset);
  const etag = stored.etag || etagOf(stored.text);
  const key = deps.dataset as unknown as object;

  let body = encodedBulk.get(key);
  if (!body || body.etag !== etag) {
    body = { etag, bytes: new TextEncoder().encode(stored.text) };
    encodedBulk.set(key, body);
  }

  return new Response(body.bytes, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": CACHE.bulk,
      "X-Content-Type-Options": "nosniff",
      // The Node entry uses this to answer from its compressed copy without
      // reading the body again.
      "Content-Length": String(body.bytes.length),
      ETag: etag,
      ...corsHeaders(),
    },
  });
}
