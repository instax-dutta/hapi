/**
 * The request handler.
 *
 * The entry point is a plain `fetch(request, env, ctx)`, so the same code runs
 * on Cloudflare Workers and on Node without a framework in between.
 *
 * The handler never throws. Every failure becomes the standard error envelope.
 */
import { applyConditional, emptyResponse, errorResponse } from "./lib/http.ts";
import { DatasetLoader } from "./lib/dataset.ts";
import { NullStore, R2Store, type DatasetStore, type R2BucketLike } from "./lib/store.ts";
import { matchRoute, type Route, type RouteContext, type RouteDeps } from "./router.ts";
import * as meta from "./routes/meta.ts";
import * as models from "./routes/models.ts";
import * as recipes from "./routes/recipes.ts";
import * as repos from "./routes/repos.ts";
import * as stats from "./routes/stats.ts";
import * as simulate from "./routes/simulate.ts";
import * as parse from "./routes/parse.ts";
import * as openapi from "./routes/openapi.ts";

export interface Env {
  /** The bucket that holds the published dataset. */
  HAPI_BUCKET?: R2BucketLike;
  /** A store supplied directly. Used by the Node entry point and by tests. */
  HAPI_STORE?: DatasetStore;
  [key: string]: unknown;
}

const routes: readonly Route[] = [
  { method: "GET", pattern: "/v1", handler: meta.serviceIndex },
  { method: "GET", pattern: "/v1/health", handler: meta.health },
  { method: "GET", pattern: "/v1/meta", handler: meta.meta },
  { method: "GET", pattern: "/v1/families", handler: meta.families },
  { method: "GET", pattern: "/v1/models", handler: models.listModels },
  { method: "GET", pattern: "/v1/models/:id*", handler: models.getModel },
  { method: "GET", pattern: "/v1/recipes", handler: recipes.listRecipes },
  { method: "GET", pattern: "/v1/recipes/:id", handler: recipes.getRecipe },
  { method: "GET", pattern: "/v1/repos", handler: repos.listRepos },
  { method: "GET", pattern: "/v1/repos/:id*", handler: repos.getRepo },
  { method: "GET", pattern: "/v1/stats", handler: stats.globalStats },
  { method: "GET", pattern: "/v1/stats/:username", handler: stats.creatorStats },
  { method: "GET", pattern: "/v1/simulate", handler: simulate.simulate },
  { method: "GET", pattern: "/v1/parse", handler: parse.parseRepo },
  { method: "GET", pattern: "/v1/openapi.json", handler: openapi.openapi },
  { method: "GET", pattern: "/v1/dataset.json", handler: openapi.dataset },
];

/**
 * One loader per store.
 *
 * The loader memoizes the parsed dataset per isolate, so the parse cost is
 * paid once rather than once per request. The store itself is stable for the
 * life of the isolate, which is what makes the memo hit.
 */
const loaders = new WeakMap<object, DatasetLoader>();
const bucketStores = new WeakMap<object, R2Store>();
const nullStore = new NullStore();

function storeFor(env: Env | undefined): DatasetStore {
  if (env?.HAPI_STORE) return env.HAPI_STORE;
  const bucket = env?.HAPI_BUCKET;
  if (!bucket) return nullStore;
  let store = bucketStores.get(bucket as unknown as object);
  if (!store) {
    store = new R2Store(bucket);
    bucketStores.set(bucket as unknown as object, store);
  }
  return store;
}

function loaderFor(env: Env | undefined): DatasetLoader {
  const store = storeFor(env);
  const key = store as unknown as object;
  let loader = loaders.get(key);
  if (!loader) {
    loader = new DatasetLoader(store);
    loaders.set(key, loader);
  }
  return loader;
}

/** A bodyless copy of a response, for `HEAD`. */
function stripBody(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.delete("Content-Length");
  return new Response(null, { status: response.status, headers });
}

export default {
  async fetch(request: Request, env: Env | undefined, _ctx: unknown): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method.toUpperCase();

    if (method === "OPTIONS") {
      return emptyResponse(204);
    }

    const { match, pathExists } = matchRoute(routes, method, url.pathname);
    if (!match) {
      if (pathExists) {
        return errorResponse(
          405,
          "method_not_allowed",
          "This API is read-only. Use GET, HEAD or OPTIONS.",
        );
      }
      return errorResponse(404, "not_found", `No endpoint matches ${url.pathname}.`);
    }

    const deps: RouteDeps = {
      dataset: loaderFor(env),
      env: (env ?? {}) as Record<string, unknown>,
      fetchImpl: fetch,
    };

    const context: RouteContext = {
      request,
      url,
      params: match.params,
      query: url.searchParams,
    };

    let response: Response;
    try {
      response = await match.route.handler(context, deps);
    } catch (error) {
      // A missing or unparseable dataset is a service problem, not a client
      // problem. Everything else is a bug, and the message stays server-side.
      const message = error instanceof Error ? error.message : String(error);
      if (message.includes("dataset object") || message.includes("dataset store")) {
        console.error("hapi: dataset unavailable", error);
        return errorResponse(
          503,
          "dataset_unavailable",
          "The dataset is being rebuilt. Try again in a few minutes.",
        );
      }
      console.error("hapi: unhandled route failure", error);
      return errorResponse(500, "internal_error", "Something went wrong. Try again shortly.");
    }

    const conditional = applyConditional(request, response);
    return method === "HEAD" ? stripBody(conditional) : conditional;
  },
};
