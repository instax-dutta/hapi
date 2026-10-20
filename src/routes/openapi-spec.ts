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

const listParameters = [
  { name: "q", in: "query", schema: { type: "string" }, description: "Free-text search." },
  { name: "family", in: "query", schema: { type: "string" }, description: "Family slug." },
  { name: "size", in: "query", schema: { type: "string" }, description: "Size class." },
  { name: "format", in: "query", schema: { type: "string" }, description: "Format slug." },
  { name: "kind", in: "query", schema: { type: "string" }, description: "Repository kind." },
  { name: "version", in: "query", schema: { type: "string" }, description: "Heretic version." },
  { name: "author", in: "query", schema: { type: "string" }, description: "Creator id." },
  { name: "origin", in: "query", schema: { type: "string" }, description: "Origin id." },
  {
    name: "minDownloads",
    in: "query",
    schema: { type: "integer", minimum: 0 },
    description: "Minimum all-time downloads.",
  },
  {
    name: "bench",
    in: "query",
    schema: { type: "string", enum: ["1"] },
    description: "Keep only rows that published benchmarks.",
  },
  {
    name: "ranked",
    in: "query",
    schema: { type: "string", enum: ["0", "1"] },
    description: "Set to 0 to include unranked recipes. Default 1.",
  },
  {
    name: "sort",
    in: "query",
    schema: { type: "string" },
    description: "Sort key. An unknown key falls back to the default.",
  },
  { name: "dir", in: "query", schema: { type: "string", enum: ["asc", "desc"] } },
  { name: "page", in: "query", schema: { type: "integer", minimum: 1, default: 1 } },
  {
    name: "perPage",
    in: "query",
    schema: { type: "integer", enum: [25, 50, 100, 200], default: 50 },
  },
];

const paginationFields = {
  updatedAt: { type: "string", format: "date-time" },
  total: { type: "integer" },
  page: { type: "integer" },
  pageCount: { type: "integer" },
  perPage: { type: "integer" },
} as const;

export const openapiDocument = {
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
    ].join("\n"),
    license: { name: "MIT" },
  },
  servers: [{ url: "https://hapi.sdad.pro", description: "Production" }],
  tags: [
    { name: "meta", description: "Service, health, dataset metadata and families." },
    { name: "models", description: "Origins: the canonical upstream models." },
    { name: "recipes", description: "Ablation recipes. The leaderboard." },
    { name: "repos", description: "Published artifacts." },
    { name: "stats", description: "Download measurements and the derived rate." },
    { name: "tools", description: "Simulation and live card parsing." },
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
        summary: "Dataset version, totals and families.",
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
    "/v1/families": {
      get: {
        tags: ["meta"],
        summary: "The model families.",
        operationId: "getFamilies",
        responses: { "200": { description: "The families." } },
      },
    },
    "/v1/models": {
      get: {
        tags: ["models"],
        summary: "List the origins.",
        operationId: "listModels",
        parameters: listParameters,
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
        parameters: listParameters,
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
        parameters: listParameters,
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
        summary: "One artifact with its recipe.",
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
          {
            name: "username",
            in: "path",
            required: true,
            schema: { type: "string" },
            description: "The Hugging Face username.",
          },
        ],
        responses: {
          "200": { description: "The creator document." },
          "404": errorResponse,
          "503": errorResponse,
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
      Model: {
        type: "object",
        required: ["id", "displayName", "family", "familySlug", "sizeClass"],
        properties: {
          id: { type: "string", description: "The canonical upstream model id." },
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
          bestRecipeId: { type: ["string", "null"] },
          bestScore: { type: ["number", "null"] },
          bestKl: { type: ["number", "null"] },
          bestRefusalRate: { type: ["number", "null"] },
          verifiedRepoCount: { type: "integer" },
          downloadsAllTime: { type: "integer" },
          downloads30d: { type: "integer" },
          lastModified: { type: "string", format: "date-time" },
        },
      },
      Recipe: {
        type: "object",
        required: ["id", "originId", "kl", "refusals", "refusalTotal", "score", "ranked"],
        properties: {
          id: { type: "string" },
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
          likes: { type: "integer" },
          lastModified: { type: "string", format: "date-time" },
          repoCount: { type: "integer" },
          bestRepoId: { type: "string" },
          evidenceRepoId: { type: "string" },
          benchmarks: { type: "array", items: { type: "object" } },
          evidence: { type: ["string", "null"] },
        },
      },
      Repo: {
        type: "object",
        required: ["id", "author", "originId", "kind"],
        properties: {
          id: { type: "string" },
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
          classificationEvidence: { type: "string" },
          metrics: { type: "object" },
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
      Meta: {
        type: "object",
        required: ["version", "generatedAt", "totals", "families"],
        properties: {
          version: { type: "string", description: "A content hash of the published dataset." },
          generatedAt: { type: "string", format: "date-time" },
          generator: { type: "string" },
          source: { type: "string" },
          totals: { type: "object" },
          families: { type: "array", items: { type: "object" } },
          counts: { type: "object" },
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
        },
      },
    },
  },
} as const;

export type OpenApiDocument = typeof openapiDocument;
