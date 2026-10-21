/**
 * The service, health, metadata and family endpoints.
 *
 * These are the cheapest reads in the API and the ones a client polls, so they
 * share the short cache policy.
 */
import { API_VERSION, DOCS_URL, errorResponse, json } from "../lib/http.ts";
import type { RouteContext, RouteDeps } from "../router.ts";

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
        summary: "/v1/summary",
        families: "/v1/families",
        family: "/v1/families/{slug}",
        versions: "/v1/versions",
        formats: "/v1/formats",
        licenses: "/v1/licenses",
        tags: "/v1/tags",
        kinds: "/v1/kinds",
        sizes: "/v1/sizes",
        models: "/v1/models",
        model: "/v1/models/{id}",
        recipes: "/v1/recipes",
        leaderboard: "/v1/recipes",
        recipe: "/v1/recipes/{id}",
        repos: "/v1/repos",
        repo: "/v1/repos/{id}",
        creators: "/v1/creators",
        creator: "/v1/creators/{username}",
        stats: "/v1/stats",
        creatorStats: "/v1/stats/{username}",
        compare: "/v1/compare",
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

export async function family(context: RouteContext, deps: RouteDeps): Promise<Response> {
  const slug = context.params.slug;
  const [meta, models, recipes] = await Promise.all([
    deps.dataset.meta(),
    deps.dataset.models(),
    deps.dataset.recipes(),
  ]);

  const record = meta.families.find((row) => row.slug === slug);
  if (!record) {
    return errorResponse(404, "not_found", `No family matches the slug "${slug}".`);
  }

  const familyModels = models
    .filter((model) => model.familySlug === slug)
    .sort((a, b) => (b.bestScore ?? 0) - (a.bestScore ?? 0));
  const familyRecipes = recipes
    .filter((recipe) => recipe.familySlug === slug)
    .sort((a, b) => b.score - a.score);

  return json(
    {
      updatedAt: meta.generatedAt,
      family: record,
      models: familyModels,
      recipes: familyRecipes,
    },
    { cache: "list" },
  );
}
