/**
 * The OpenAPI 3.1 description of the public surface.
 *
 * This module is the single source of truth. `docs/openapi.json` is generated
 * from it, and the route serves it verbatim.
 */
import { API_VERSION } from "../lib/http.ts";

const errorResponse = {
  description: "The request could not be served.",
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/Error" } },
  },
} as const;

/**
 * The parameters each list endpoint honours.
 *
 * A parameter is advertised only where it is honoured. A client that builds a
 * filter menu from this description must not send a filter the endpoint
 * silently ignores.
 */
const pagination = [
  { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
  {
    name: "perPage",
    in: "query",
    schema: { type: "integer", enum: [25, 50, 100, 200], default: 50 },
  },
];

const text = {
  name: "q",
  in: "query",
  schema: { type: "string" },
  description: "Free-text search.",
};
const family = { name: "family", in: "query", schema: { type: "string" }, description: "Family slug." };
const size = { name: "size", in: "query", schema: { type: "string" }, description: "Size class." };
const format = { name: "format", in: "query", schema: { type: "string" }, description: "Format slug." };
const kind = { name: "kind", in: "query", schema: { type: "string" }, description: "Repository kind." };
const version = { name: "version", in: "query", schema: { type: "string" }, description: "Heretic version." };
const author = { name: "author", in: "query", schema: { type: "string" }, description: "Creator id." };
const origin = { name: "origin", in: "query", schema: { type: "string" }, description: "Origin id." };
const license = { name: "license", in: "query", schema: { type: "string" }, description: "License id." };
const quant = { name: "quant", in: "query", schema: { type: "string" }, description: "Quantization label." };
const minDownloads = {
  name: "minDownloads",
  in: "query",
  schema: { type: "integer", minimum: 0 },
  description: "Minimum all-time downloads.",
};
const minScore = { name: "minScore", in: "query", schema: { type: "number", minimum: 0 } };
const maxKl = { name: "maxKl", in: "query", schema: { type: "number", minimum: 0 } };
const minLikes = { name: "minLikes", in: "query", schema: { type: "integer", minimum: 0 } };
const minParams = { name: "minParams", in: "query", schema: { type: "number", minimum: 0 } };
const maxParams = { name: "maxParams", in: "query", schema: { type: "number", minimum: 0 } };
const bench = {
  name: "bench",
  in: "query",
  schema: { type: "string", enum: ["1"] },
  description: "Keep only rows that published benchmarks.",
};
const ranked = {
  name: "ranked",
  in: "query",
  schema: { type: "string", enum: ["0", "1"] },
  description: "Set to 0 to include unranked ablations. Default 1.",
};
const pareto = { name: "pareto", in: "query", schema: { type: "string", enum: ["1"] } };
const bestPick = { name: "bestPick", in: "query", schema: { type: "string", enum: ["1"] } };
const implausible = {
  name: "implausible",
  in: "query",
  schema: { type: "string", enum: ["0", "1"] },
  description:
    "Set to 0 to drop the ablations whose divergence is below the floor. Default: keep both.",
};
const direct = {
  name: "direct",
  in: "query",
  schema: { type: "string", enum: ["1"] },
  description: "Keep only the direct conversions.",
};
const updatedAfter = {
  name: "updatedAfter",
  in: "query",
  schema: { type: "string", format: "date-time" },
  description: "Keep only rows modified at or after this instant.",
};
const verification = {
  name: "verification",
  in: "query",
  schema: { type: "string", enum: ["verified", "unverified", "publisher"] },
  description: "The corroboration state of an ablation.",
};
const confidence = {
  name: "confidence",
  in: "query",
  schema: { type: "string", enum: ["high", "medium", "inherited", "none"] },
  description: "The confidence of the published numbers.",
};

const sortParameter = (keys: readonly string[]) => ({
  name: "sort",
  in: "query",
  schema: { type: "string", enum: keys },
  description: "The sort key. An unknown key falls back to the default.",
});
const direction = {
  name: "dir",
  in: "query",
  schema: { type: "string", enum: ["asc", "desc"] },
  description: "The direction. The default depends on the sort key.",
};

const paginationFields = {
  updatedAt: { type: "string", format: "date-time" },
  total: { type: "integer" },
  page: { type: "integer" },
  pageCount: { type: "integer" },
  perPage: { type: "integer" },
} as const;

const facetDocument = (name: string) => ({
  type: "object",
  required: ["facet", "total", "values"],
  properties: {
    updatedAt: { type: "string", format: "date-time" },
    facet: { type: "string", examples: [name] },
    total: { type: "integer" },
    values: {
      type: "array",
      items: {
        type: "object",
        properties: {
          value: { type: "string" },
          count: { type: "integer" },
          downloadsAllTime: { type: "integer" },
        },
      },
    },
  },
});

const methodNotAllowed = {
  description: "The method is not allowed. The API is read-only.",
  content: {
    "application/json": { schema: { $ref: "#/components/schemas/Error" } },
  },
} as const;

/**
 * The paths that read the published dataset.
 *
 * Each of them can answer 503 while the dataset is being rebuilt, so each of
 * them has to say so.
 */
const DATASET_PATHS = new Set([
  "/v1/health",
  "/v1/meta",
  "/v1/summary",
  "/v1/families",
  "/v1/families/{slug}",
  "/v1/versions",
  "/v1/formats",
  "/v1/licenses",
  "/v1/tags",
  "/v1/kinds",
  "/v1/sizes",
  "/v1/models",
  "/v1/models/{id}",
  "/v1/recipes",
  "/v1/recipes/{id}",
  "/v1/repos",
  "/v1/repos/{id}",
  "/v1/creators",
  "/v1/creators/{username}",
  "/v1/stats",
  "/v1/stats/{username}",
  "/v1/compare",
  "/v1/dataset.json",
]);

const document = {
  openapi: "3.1.0",
  info: {
    title: "hapi - Heretic API",
    version: API_VERSION,
    summary: "A public, free, read-only JSON API for the Heretic (abliterated) model ecosystem.",
    description: [
      "hapi combines the live download intelligence of `heretic-live-agent` with the",
      "Heretic directory of `heretico` into one read-only API.",
      "",
      "Three entity levels: an **origin** is one canonical upstream model, a",
      "**recipe** is one ablation attempt and is what a leaderboard ranks, and a",
      "**repo** is one published artifact. An artifact is never ranked.",
      "",
      "Every response is CORS-open. There is no key, no account and no signup.",
      "",
      "A metric is never invented. A model card that does not publish KL and",
      "refusals yields an unranked recipe, and the response says so.",
      "",
      "Numbers that are derived rather than measured are named as such:",
      "`downloadsPerDay`, `downloadsPerSecond` and `refusalReduction` are",
      "calculations, and the API says which.",
    ].join("\n"),
    license: { name: "MIT" },
  },
  servers: [{ url: "https://hapi.sdad.pro", description: "Production" }],
  tags: [
    { name: "meta", description: "Service, health, dataset metadata, summary and facets." },
    { name: "models", description: "Origins: the canonical upstream models." },
    { name: "recipes", description: "Ablation recipes. The leaderboard." },
    { name: "repos", description: "Published artifacts." },
    { name: "creators", description: "The people who published the artifacts." },
    { name: "stats", description: "Download measurements and the derived rate." },
    { name: "tools", description: "Comparison, simulation and live card parsing." },
  ],
  paths: {
    "/v1": {
      get: {
        tags: ["meta"],
        summary: "The service index.",
        operationId: "getServiceIndex",
        responses: { "200": { description: "The index." } },
      },
    },
    "/v1/health": {
      get: {
        tags: ["meta"],
        summary: "Liveness and dataset freshness.",
        operationId: "getHealth",
        responses: { "200": { description: "The health document." } },
      },
    },
    "/v1/meta": {
      get: {
        tags: ["meta"],
        summary: "Dataset version, totals, families and facets.",
        operationId: "getMeta",
        responses: {
          "200": {
            description: "The dataset metadata.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Meta" } },
            },
          },
          "503": errorResponse,
        },
      },
    },
    "/v1/summary": {
      get: {
        tags: ["meta"],
        summary: "Everything a homepage needs, in one request.",
        operationId: "getSummary",
        responses: {
          "200": { description: "The summary document." },
          "503": errorResponse,
        },
      },
    },
    "/v1/families": {
      get: {
        tags: ["meta"],
        summary: "The model families.",
        operationId: "getFamilies",
        responses: { "200": { description: "The families." } },
      },
    },
    "/v1/families/{slug}": {
      get: {
        tags: ["meta"],
        summary: "One family with its models and its ablations.",
        operationId: "getFamily",
        parameters: [
          { name: "slug", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "The family document." },
          "404": errorResponse,
          "503": errorResponse,
        },
      },
    },
    "/v1/versions": {
      get: {
        tags: ["meta"],
        summary: "The Heretic versions in use.",
        operationId: "getVersions",
        responses: {
          "200": {
            description: "The versions.",
            content: { "application/json": { schema: facetDocument("versions") } },
          },
        },
      },
    },
    "/v1/formats": {
      get: {
        tags: ["meta"],
        summary: "The artifact formats in use.",
        operationId: "getFormats",
        responses: {
          "200": {
            description: "The formats.",
            content: { "application/json": { schema: facetDocument("formats") } },
          },
        },
      },
    },
    "/v1/licenses": {
      get: {
        tags: ["meta"],
        summary: "The licenses in use.",
        operationId: "getLicenses",
        responses: {
          "200": {
            description: "The licenses.",
            content: { "application/json": { schema: facetDocument("licenses") } },
          },
        },
      },
    },
    "/v1/tags": {
      get: {
        tags: ["meta"],
        summary: "The Hub tags in use.",
        operationId: "getTags",
        responses: {
          "200": {
            description: "The tags.",
            content: { "application/json": { schema: facetDocument("tags") } },
          },
        },
      },
    },
    "/v1/kinds": {
      get: {
        tags: ["meta"],
        summary: "The repository kinds in use.",
        operationId: "getKinds",
        responses: {
          "200": {
            description: "The kinds.",
            content: { "application/json": { schema: facetDocument("kinds") } },
          },
        },
      },
    },
    "/v1/sizes": {
      get: {
        tags: ["meta"],
        summary: "The size classes in use.",
        operationId: "getSizes",
        responses: {
          "200": {
            description: "The size classes.",
            content: { "application/json": { schema: facetDocument("sizes") } },
          },
        },
      },
    },
    "/v1/models": {
      get: {
        tags: ["models"],
        summary: "List the origins.",
        operationId: "listModels",
        parameters: [
          text,
          family,
          size,
          format,
          minDownloads,
          minScore,
          maxKl,
          minLikes,
          minParams,
          maxParams,
          implausible,
          updatedAfter,
          sortParameter(["score", "kl", "refusals", "refusalRate", "downloads", "recent", "params", "newest", "model", "recipes", "repos", "likes"]),
          direction,
          ...pagination,
        ],
        responses: {
          "200": {
            description: "A page of origins.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/ModelList" } },
            },
          },
          "503": errorResponse,
        },
      },
    },
    "/v1/models/{id}": {
      get: {
        tags: ["models"],
        summary: "One origin with its recipes and artifacts.",
        operationId: "getModel",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "The origin id, for example `google/gemma-3-12b-it`.",
          },
        ],
        responses: {
          "200": { description: "The origin document." },
          "404": errorResponse,
          "503": errorResponse,
        },
      },
    },
    "/v1/recipes": {
      get: {
        tags: ["recipes"],
        summary: "List the ablation recipes. The leaderboard.",
        operationId: "listRecipes",
        parameters: [
          text,
          family,
          size,
          format,
          kind,
          version,
          verification,
          confidence,
          minDownloads,
          minScore,
          maxKl,
          minLikes,
          bench,
          ranked,
          pareto,
          bestPick,
          implausible,
          updatedAfter,
          sortParameter(["score", "kl", "refusals", "refusalRate", "downloads", "recent", "params", "newest", "model", "likes", "benchmarks", "repos"]),
          direction,
          ...pagination,
        ],
        responses: {
          "200": {
            description: "A page of recipes.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/RecipeList" } },
            },
          },
          "503": errorResponse,
        },
      },
    },
    "/v1/recipes/{id}": {
      get: {
        tags: ["recipes"],
        summary: "One recipe with its origin and artifacts.",
        operationId: "getRecipe",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "The recipe id, for example `rcp_60b23972`.",
          },
        ],
        responses: {
          "200": { description: "The recipe document." },
          "404": errorResponse,
          "503": errorResponse,
        },
      },
    },
    "/v1/repos": {
      get: {
        tags: ["repos"],
        summary: "List the published artifacts.",
        operationId: "listRepos",
        parameters: [
          text,
          family,
          size,
          format,
          kind,
          version,
          author,
          origin,
          license,
          quant,
          minDownloads,
          minLikes,
          minParams,
          maxParams,
          bench,
          direct,
          updatedAfter,
          sortParameter(["downloads", "recent", "likes", "params", "newest", "created", "author", "model"]),
          direction,
          ...pagination,
        ],
        responses: {
          "200": {
            description: "A page of artifacts.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/RepoList" } },
            },
          },
          "503": errorResponse,
        },
      },
    },
    "/v1/repos/{id}": {
      get: {
        tags: ["repos"],
        summary: "One artifact with its recipe and origin.",
        operationId: "getRepo",
        parameters: [
          {
            name: "id",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "The repository id, for example `coder3101/gemma-3-12b-it-heretic`.",
          },
        ],
        responses: {
          "200": { description: "The artifact document." },
          "404": errorResponse,
          "503": errorResponse,
        },
      },
    },
    "/v1/creators": {
      get: {
        tags: ["creators"],
        summary: "The creator leaderboard.",
        operationId: "listCreators",
        parameters: [
          text,
          minDownloads,
          minLikes,
          minScore,
          sortParameter(["downloads", "recent", "models", "recipes", "score", "likes", "newest", "author"]),
          direction,
          ...pagination,
        ],
        responses: {
          "200": {
            description: "A page of creators.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/CreatorList" } },
            },
          },
          "503": errorResponse,
        },
      },
    },
    "/v1/creators/{username}": {
      get: {
        tags: ["creators"],
        summary: "One creator with their artifacts and their ablations.",
        operationId: "getCreator",
        parameters: [
          { name: "username", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "The creator document." },
          "404": errorResponse,
          "503": errorResponse,
        },
      },
    },
    "/v1/stats": {
      get: {
        tags: ["stats"],
        summary: "The global download totals and the derived rate.",
        operationId: "getStats",
        responses: {
          "200": {
            description: "The measurement document.",
            content: {
              "application/json": { schema: { $ref: "#/components/schemas/Stats" } },
            },
          },
          "503": errorResponse,
        },
      },
    },
    "/v1/stats/{username}": {
      get: {
        tags: ["stats"],
        summary: "One creator's download totals, rate and models.",
        operationId: "getCreatorStats",
        parameters: [
          { name: "username", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "The creator document." },
          "404": errorResponse,
          "503": errorResponse,
        },
      },
    },
    "/v1/compare": {
      get: {
        tags: ["tools"],
        summary: "Compare two models side by side.",
        operationId: "compareModels",
        parameters: [
          {
            name: "a",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "A model id, an ablation id or an artifact id.",
          },
          {
            name: "b",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "A model id, an ablation id or an artifact id.",
          },
        ],
        responses: {
          "200": { description: "The comparison document." },
          "400": errorResponse,
          "404": errorResponse,
        },
      },
    },
    "/v1/simulate": {
      get: {
        tags: ["tools"],
        summary: "Draw synthetic download events from a Poisson distribution.",
        operationId: "simulateDownloads",
        parameters: [
          {
            name: "rate",
            in: "query",
            schema: { type: "number", minimum: 0 },
            description: "Downloads per second.",
          },
          {
            name: "last30DaysDownloads",
            in: "query",
            schema: { type: "number", minimum: 0 },
            description: "A 30-day total to derive the rate from.",
          },
          { name: "windowDays", in: "query", schema: { type: "number", default: 30 } },
          { name: "seconds", in: "query", schema: { type: "number", default: 60 } },
          { name: "seed", in: "query", schema: { type: "integer", default: 1 } },
        ],
        responses: {
          "200": { description: "The simulation document." },
          "400": errorResponse,
        },
      },
    },
    "/v1/parse": {
      get: {
        tags: ["tools"],
        summary: "Parse a live model card.",
        operationId: "parseCard",
        parameters: [
          {
            name: "repo",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "The repository id, for example `coder3101/gemma-3-12b-it-heretic`.",
          },
        ],
        responses: {
          "200": { description: "The parsed card." },
          "400": errorResponse,
          "404": errorResponse,
          "502": errorResponse,
        },
      },
    },
    "/v1/openapi.json": {
      get: {
        tags: ["meta"],
        summary: "This document.",
        operationId: "getOpenApi",
        responses: { "200": { description: "The OpenAPI description." } },
      },
    },
    "/v1/dataset.json": {
      get: {
        tags: ["meta"],
        summary: "The whole dataset in one document.",
        operationId: "getDataset",
        responses: { "200": { description: "The dataset." } },
      },
    },
  },
  components: {
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["status", "code", "message", "docs"],
            properties: {
              status: { type: "integer" },
              code: {
                type: "string",
                enum: [
                  "bad_request",
                  "not_found",
                  "method_not_allowed",
                  "upstream_unavailable",
                  "dataset_unavailable",
                  "internal_error",
                ],
              },
              message: { type: "string" },
              docs: { type: "string" },
            },
          },
        },
      },
      BestRecipe: {
        type: "object",
        required: ["id", "score", "kl", "refusals", "refusalTotal"],
        properties: {
          id: { type: "string" },
          author: { type: "string" },
          implausible: { type: "boolean" },
          score: { type: "number" },
          kl: { type: "number" },
          refusals: { type: "integer" },
          refusalTotal: { type: "integer" },
          refusalRate: { type: "number" },
          verification: { type: "string" },
          confidence: { type: "string" },
          hereticVersion: { type: ["string", "null"] },
          downloadsAllTime: { type: "integer" },
          lastModified: { type: "string" },
          originalKl: { type: ["number", "null"] },
          originalRefusals: { type: ["integer", "null"] },
          originalRefusalTotal: { type: ["integer", "null"] },
        },
      },
      Model: {
        type: "object",
        required: ["id", "displayName", "family", "familySlug", "sizeClass"],
        properties: {
          id: { type: "string", description: "The canonical upstream model id." },
          url: { type: "string" },
          owner: { type: "string" },
          name: { type: "string" },
          displayName: { type: "string" },
          family: { type: "string" },
          familySlug: { type: "string" },
          paramsB: { type: ["number", "null"] },
          paramsActiveB: { type: ["number", "null"] },
          sizeClass: { type: "string" },
          moe: { type: "boolean" },
          recipeCount: { type: "integer" },
          rankedCount: { type: "integer" },
          repoCount: { type: "integer" },
          bestRecipeId: { type: ["string", "null"] },
          rank: { type: ["integer", "null"], description: "The position among the models, best first." },
          bestScore: { type: ["number", "null"] },
          bestKl: { type: ["number", "null"] },
          bestRefusalRate: { type: ["number", "null"] },
          bestRecipe: { type: ["object", "null"], description: "The corroborated ablation that leads this model." },
          verifiedRepoCount: { type: "integer" },
          downloadsAllTime: { type: "integer" },
          downloads30d: { type: "integer" },
          downloadsPerDay: { type: "number", description: "Derived from the 30-day mean." },
          likes: { type: "integer" },
          lastModified: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          formats: { type: "array", items: { type: "string" } },
          licenses: { type: "array", items: { type: "string" } },
          hereticVersions: { type: "array", items: { type: "string" } },
          authors: { type: "array", items: { type: "string" } },
        },
      },
      Recipe: {
        type: "object",
        required: ["id", "originId", "kl", "refusals", "refusalTotal", "score", "ranked"],
        properties: {
          id: { type: "string" },
          url: { type: "string" },
          rank: { type: ["integer", "null"], description: "The position among the ranked ablations." },
          familyRank: { type: ["integer", "null"], description: "The position among the ablations of the same model." },
          originId: { type: "string" },
          originName: { type: "string" },
          family: { type: "string" },
          familySlug: { type: "string" },
          sizeClass: { type: "string" },
          author: { type: "string" },
          kind: { type: "string" },
          kl: { type: "number" },
          refusals: { type: "integer" },
          refusalTotal: { type: "integer" },
          refusalRate: { type: "number" },
          score: { type: "number", description: "0..100. 0 when the card published no pair." },
          ranked: { type: "boolean" },
          pareto: { type: "boolean" },
          bestPick: { type: "boolean" },
          implausible: { type: "boolean" },
          confidence: { type: "string", enum: ["high", "medium", "inherited", "none"] },
          verification: { type: "string", enum: ["verified", "unverified", "publisher"] },
          hereticVersion: { type: ["string", "null"] },
          formats: { type: "array", items: { type: "string" } },
          paramsB: { type: ["number", "null"] },
          downloadsAllTime: { type: "integer" },
          downloads30d: { type: "integer" },
          downloadsPerDay: { type: "number", description: "Derived from the 30-day mean." },
          likes: { type: "integer" },
          lastModified: { type: "string", format: "date-time" },
          createdAt: { type: "string", format: "date-time" },
          repoCount: { type: "integer" },
          repoIds: { type: "array", items: { type: "string" } },
          bestRepoId: { type: "string" },
          evidenceRepoId: { type: "string" },
          benchmarks: { type: "array", items: { type: "object" } },
          benchmarkCount: { type: "integer" },
          evidence: { type: ["string", "null"] },
          originalKl: { type: ["number", "null"] },
          originalRefusals: { type: ["integer", "null"] },
          originalRefusalTotal: { type: ["integer", "null"] },
          baseRefusalRate: { type: ["number", "null"] },
          refusalReduction: { type: ["number", "null"] },
          licenses: { type: "array", items: { type: "string" } },
          quantizations: { type: "array", items: { type: "string" } },
          authors: { type: "array", items: { type: "string" } },
        },
      },
      Repo: {
        type: "object",
        required: ["id", "author", "originId", "kind"],
        properties: {
          id: { type: "string" },
          url: { type: "string" },
          author: { type: "string" },
          originId: { type: "string" },
          recipeId: { type: ["string", "null"] },
          kind: { type: "string" },
          downloads30d: { type: "integer" },
          downloadsAllTime: { type: "integer" },
          likes: { type: "integer" },
          paramsB: { type: ["number", "null"] },
          sizeClass: { type: "string" },
          family: { type: "string" },
          familySlug: { type: "string" },
          formats: { type: "array", items: { type: "string" } },
          quant: { type: ["string", "null"] },
          license: { type: ["string", "null"] },
          pipelineTag: { type: ["string", "null"] },
          libraryName: { type: ["string", "null"] },
          gated: { type: "boolean" },
          createdAt: { type: "string", format: "date-time" },
          lastModified: { type: "string", format: "date-time" },
          hereticVersion: { type: ["string", "null"] },
          verified: { type: "boolean" },
          isDirectConversion: { type: "boolean" },
          classificationEvidence: { type: "string" },
          parentIds: { type: "array", items: { type: "string" } },
          tags: { type: "array", items: { type: "string" } },
          safetensorsTotal: { type: ["number", "null"] },
          benchmarkCount: { type: "integer" },
          kl: { type: ["number", "null"] },
          refusals: { type: ["integer", "null"] },
          refusalTotal: { type: ["integer", "null"] },
          confidence: { type: "string", enum: ["high", "medium", "inherited", "none"] },
          evidence: { type: ["string", "null"] },
          inheritedFrom: { type: ["string", "null"] },
        },
      },
      Creator: {
        type: "object",
        required: ["username", "totals", "rate"],
        properties: {
          scope: { type: "string", enum: ["user"] },
          username: { type: "string" },
          updatedAt: { type: "string", format: "date-time" },
          totals: { type: "object" },
          rate: { type: "object" },
          source: { type: "string" },
          recipeCount: { type: "integer" },
          originCount: { type: "integer" },
          likes: { type: "integer" },
          bestScore: { type: ["number", "null"] },
          bestKl: { type: ["number", "null"] },
          bestRefusalRate: { type: ["number", "null"] },
          verifiedCount: { type: "integer" },
          lastModified: { type: "string", format: "date-time" },
          models: { type: "array", items: { type: "object" } },
        },
      },
      ModelList: {
        type: "object",
        required: ["updatedAt", "total", "page", "pageCount", "perPage", "rows"],
        properties: {
          ...paginationFields,
          rows: { type: "array", items: { $ref: "#/components/schemas/Model" } },
        },
      },
      RecipeList: {
        type: "object",
        required: ["updatedAt", "total", "page", "pageCount", "perPage", "rows"],
        properties: {
          ...paginationFields,
          rows: { type: "array", items: { $ref: "#/components/schemas/Recipe" } },
        },
      },
      RepoList: {
        type: "object",
        required: ["updatedAt", "total", "page", "pageCount", "perPage", "rows"],
        properties: {
          ...paginationFields,
          rows: { type: "array", items: { $ref: "#/components/schemas/Repo" } },
        },
      },
      CreatorList: {
        type: "object",
        required: ["updatedAt", "total", "page", "pageCount", "perPage", "rows"],
        properties: {
          ...paginationFields,
          rows: { type: "array", items: { $ref: "#/components/schemas/Creator" } },
        },
      },
      Meta: {
        type: "object",
        required: ["version", "generatedAt", "totals", "families", "facets"],
        properties: {
          version: { type: "string", description: "A content hash of the published dataset." },
          generatedAt: { type: "string", format: "date-time" },
          generator: { type: "string" },
          source: { type: "string" },
          totals: { type: "object" },
          families: { type: "array", items: { type: "object" } },
          counts: { type: "object" },
          facets: { type: "object" },
        },
      },
      Stats: {
        type: "object",
        required: ["scope", "updatedAt", "totals", "rate"],
        properties: {
          scope: { type: "string", enum: ["global", "user"] },
          username: { type: ["string", "null"] },
          updatedAt: { type: "string", format: "date-time" },
          totals: {
            type: "object",
            required: ["modelCount", "allTimeDownloads", "last30DaysDownloads"],
            properties: {
              modelCount: { type: "integer" },
              allTimeDownloads: { type: "integer" },
              last30DaysDownloads: { type: "integer" },
            },
          },
          rate: {
            type: "object",
            required: ["downloadsPerSecond", "windowDays", "basis"],
            properties: {
              downloadsPerSecond: { type: "number" },
              windowDays: { type: "integer" },
              basis: { type: "string", enum: ["derived"] },
            },
          },
          source: { type: "string" },
          indexed: { type: "object", description: "The artifacts the directory publishes." },
          discovered: { type: "object", description: "Every model the tag-and-name index found." },
          discoveredRate: { type: "object" },
        },
      },
    },
  },
};

/**
 * Every path answers 405 for a method it does not have, and the paths that
 * read the dataset can answer 503 while it is being rebuilt. The descriptions
 * say so rather than leaving a client to guess.
 */
export const openapiDocument = {
  ...document,
  paths: Object.fromEntries(
    Object.entries(document.paths).map(([path, entry]) => {
      const responses = { ...entry.get.responses };
      if (!responses["405"]) responses["405"] = methodNotAllowed;
      if (DATASET_PATHS.has(path) && !responses["503"]) responses["503"] = errorResponse;
      return [path, { ...entry, get: { ...entry.get, responses } }];
    }),
  ),
};

export type OpenApiDocument = typeof openapiDocument;
