# src

## Purpose

The API runtime: the request handler, the dataset model, the query engine, the
HTTP helpers and the store abstraction. Everything here turns a request into a
JSON document, and a JSON document back into a response.

## Ownership

- `index.ts` - the exported `fetch(request, env, ctx)` handler. The only entry point
- `server-node.ts` - the Node entry point. The same handler over the filesystem store
- `router.ts` - path matching and parameter extraction. No domain knowledge
- `http.ts` - CORS, JSON responses, the error envelope, ETag and conditional
  requests
- `store.ts` - the `DatasetStore` interface plus the R2 and filesystem
  implementations. A store hands over the bytes and its own validator for them
- `dataset.ts` - the published dataset shape and the lazy, memoized loader
- `hf.ts` - the Hugging Face Hub client: pagination, expansions, retries, the
  README fetch. The one place that knows how to talk to the Hub
- `store-file.ts` - the filesystem store, for the Node entry point and the tests.
  It is never reachable from the Worker bundle
- `types.ts` - the public API response types

## Local Contracts

### Handler shape

- The entry point is `export default { fetch }` with the standard
  `fetch(request, env, ctx)` signature. It must run unchanged on Cloudflare
  Workers and on Node
- No `node:` imports in the request path. A file that the request path reaches
  must not import `node:fs`, `node:path` or `node:child_process`
- The handler never throws. Every failure becomes an error envelope with the
  standard shape
- `env` is optional in the type. A missing binding is a `503`, not a crash

### The dataset is the source of truth

- Every number the API returns comes from the published dataset. The handler
  never fetches the Hub, except on `GET /v1/parse`
- The dataset is loaded lazily per entity family and memoized per isolate.
  A request for `/v1/repos` must not pay the parse cost of the origin data.
  The families are `meta`, `models`, `recipes`, `repos`, `creators` and `stats`
- A dataset that is missing or unparseable answers `503 dataset_unavailable`
  with a plain sentence. It never answers with a partial document

### HTTP

- CORS headers are set before any branch, including errors, so a browser never
  sees an opaque failure
- `Access-Control-Allow-Origin: *`, `Access-Control-Allow-Methods: GET, HEAD,
  OPTIONS`, `Access-Control-Allow-Headers: Content-Type, If-None-Match`
- `OPTIONS` answers `204` with no body
- `HEAD` mirrors `GET` exactly, including status and headers, with the body
  omitted. It runs the same path rather than short-circuiting
- Any method other than `GET`, `HEAD` and `OPTIONS` answers `405`
- Every error response overrides the cache headers to `no-store`. A failure
  cached at the edge leaves the API degraded long after the cause is gone
- Upstream messages are never echoed to the client. The server logs them

### Query engine

- Unknown parameter values fall back to the default. A client that sends
  `sort=bogus` gets the default sort, not a 400
- `perPage` is one of 25, 50, 100, 200. Default 50
- `page` is clamped into range. A page past the end returns the last page, not
  an empty page with a wrong page number
- The sort must agree with the rank column. A list whose rows read 17, 19, 18 is
  right about every number in it and still looks broken

## Work Guidance

- Keep the router dumb. It matches paths and hands over; it does not decide
  what a route returns
- One route module per endpoint family. A route module owns its parameters, its
  document and nothing else
- The store is an interface with two implementations. A third implementation is
  a sign that the interface is wrong
- New response fields go in the OpenAPI description in the same change

## Verification

- `npm run test:integration` covers every route through a real `Request` and a
  fake store
- `npm run typecheck` must be clean
- A change to a response shape needs a test that asserts the JSON body, not
  only the status code

## Child DOX Index

- `src/core/AGENTS.md` - pure domain logic ported from heretico and heretic-live-agent
- `src/routes/AGENTS.md` - the public endpoint surface
