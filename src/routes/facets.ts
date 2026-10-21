/**
 * The facet endpoints.
 *
 * A facet is a value a client can filter by: a Heretic version, a format, a
 * license, a tag. Each endpoint returns the values with their counts, so a
 * client can build a filter menu without a second request.
 */
import { json } from "../lib/http.ts";
import type { DatasetFacets } from "../lib/types.ts";
import type { RouteContext, RouteDeps } from "../router.ts";

function facetDocument(
  name: keyof DatasetFacets,
  values: DatasetFacets[keyof DatasetFacets],
) {
  return { facet: name, total: values.length, values };
}

export async function versions(_context: RouteContext, deps: RouteDeps): Promise<Response> {
  const meta = await deps.dataset.meta();
  return json(
    { updatedAt: meta.generatedAt, ...facetDocument("versions", meta.facets.versions) },
    { cache: "meta" },
  );
}

export async function formats(_context: RouteContext, deps: RouteDeps): Promise<Response> {
  const meta = await deps.dataset.meta();
  return json(
    { updatedAt: meta.generatedAt, ...facetDocument("formats", meta.facets.formats) },
    { cache: "meta" },
  );
}

export async function licenses(_context: RouteContext, deps: RouteDeps): Promise<Response> {
  const meta = await deps.dataset.meta();
  return json(
    { updatedAt: meta.generatedAt, ...facetDocument("licenses", meta.facets.licenses) },
    { cache: "meta" },
  );
}

export async function tags(_context: RouteContext, deps: RouteDeps): Promise<Response> {
  const meta = await deps.dataset.meta();
  return json(
    { updatedAt: meta.generatedAt, ...facetDocument("tags", meta.facets.tags) },
    { cache: "meta" },
  );
}

export async function kinds(_context: RouteContext, deps: RouteDeps): Promise<Response> {
  const meta = await deps.dataset.meta();
  return json(
    { updatedAt: meta.generatedAt, ...facetDocument("kinds", meta.facets.kinds) },
    { cache: "meta" },
  );
}

export async function sizes(_context: RouteContext, deps: RouteDeps): Promise<Response> {
  const meta = await deps.dataset.meta();
  return json(
    { updatedAt: meta.generatedAt, ...facetDocument("sizes", meta.facets.sizes) },
    { cache: "meta" },
  );
}
