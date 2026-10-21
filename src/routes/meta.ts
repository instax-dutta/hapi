/**
 * The service, health, metadata and family endpoints.
 *
 * These are the cheapest reads in the API and the ones a client polls, so they
 * share the short cache policy.
 */
import { API_VERSION, DOCS_URL, json } from "../lib/http.ts";
import type { RouteContext, RouteDeps } from "../router.ts";

export const META_SORTS = [] as const;

export async function serviceIndex(_context: RouteContext, _deps: RouteDeps): Promise<Response> {
  return json(
    {
      service: "hapi",
      name: "Heretic API",
      description:
        "A public, free, read-only JSON API for the Heretic (abliterated) model ecosystem on Hugging Face.",
      version: API_VERSION,
      docs: DOCS_URL,
      base: "/v1",
      license: "MIT",
      endpoints: {
        service: "/v1",
        health: "/v1/health",
        meta: "/v1/meta",
        families: "/v1/families",
        models: "/v1/models",
        model: "/v1/models/{id}",
        recipes: "/v1/recipes",
        leaderboard: "/v1/recipes",
        recipe: "/v1/recipes/{id}",
        repos: "/v1/repos",
        repo: "/v1/repos/{id}",
        stats: "/v1/stats",
        creatorStats: "/v1/stats/{username}",
        simulate: "/v1/simulate",
        parse: "/v1/parse",
        openapi: "/v1/openapi.json",
        dataset: "/v1/dataset.json",
      },
    },
    { cache: "meta" },
  );
}

export async function health(_context: RouteContext, deps: RouteDeps): Promise<Response> {
  const meta = await deps.dataset.meta();
  const generatedAt = Date.parse(meta.generatedAt);
  const ageSeconds = Number.isFinite(generatedAt)
    ? Math.max(0, Math.round((Date.now() - generatedAt) / 1000))
    : null;

  return json(
    {
      status: "ok",
      api: { version: API_VERSION },
      dataset: {
        version: meta.version,
        generatedAt: meta.generatedAt,
        ageSeconds,
        source: meta.source,
      },
    },
    { cache: "meta" },
  );
}

export async function meta(_context: RouteContext, deps: RouteDeps): Promise<Response> {
  const body = await deps.dataset.meta();
  return json(body, { cache: "meta" });
}

export async function families(_context: RouteContext, deps: RouteDeps): Promise<Response> {
  const body = await deps.dataset.meta();
  return json(
    { updatedAt: body.generatedAt, total: body.families.length, families: body.families },
    { cache: "meta" },
  );
}
