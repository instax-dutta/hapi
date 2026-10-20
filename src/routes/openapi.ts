/**
 * The OpenAPI description and the bulk dataset dump.
 */
import { json } from "../lib/http.ts";
import type { RouteContext, RouteDeps } from "../router.ts";
import { openapiDocument } from "./openapi-spec.ts";

export async function openapi(_context: RouteContext, _deps: RouteDeps): Promise<Response> {
  return json(openapiDocument, { cache: "meta" });
}

export async function dataset(_context: RouteContext, deps: RouteDeps): Promise<Response> {
  const body = await deps.dataset.dataset();
  return json(body, { cache: "bulk" });
}
