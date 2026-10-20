# src/routes

## Purpose

The public endpoint surface. One module per endpoint family. Each module owns
its parameters, its document and its failure modes, and nothing else.

## Ownership

- `meta.ts` - `/v1`, `/v1/health`, `/v1/meta`, `/v1/families`
- `models.ts` - `/v1/models` and `/v1/models/{id}`
- `recipes.ts` - `/v1/recipes` and `/v1/recipes/{id}`
- `repos.ts` - `/v1/repos` and `/v1/repos/{id}`
- `stats.ts` - `/v1/stats` and `/v1/stats/{username}`
- `simulate.ts` - `/v1/simulate`
- `parse.ts` - `/v1/parse`
- `openapi.ts` - `/v1/openapi.json` and `/v1/dataset.json`

## Local Contracts

### One document per request

- A detail endpoint returns the entity together with its context. A client
  reading one origin gets its recipes and its artifacts in the same document
  and never needs a second round trip
- A list endpoint returns the standard envelope: `updatedAt`, `total`, `page`,
  `pageCount`, `perPage`, `rows`

### Never invent a metric

- An unranked recipe is returned with `ranked: false` and `score: 0`. It is
  never dropped silently and never given a score
- A recipe whose KL is below the floor is returned with `implausible: true`
- A repo that inherited its metrics from another repo is returned with
  `metricsSource` naming the repo it inherited from

### Ordering

- Corroboration outranks score in every ordering, including a sort the client
  asked for. An unverified row can never sit at the top of any list
- The sort key, the direction and the rank column always agree

### Failure

- A missing entity answers `404 not_found` with a sentence naming what was
  looked for
- A malformed parameter answers `400 bad_request` only when the parameter makes
  the request meaningless. A parameter with an unknown value falls back to its
  default
- `/v1/parse` is the only route that touches the network. An upstream failure
  answers `502 upstream_unavailable` with a plain sentence, never the upstream
  message

### OpenAPI

- Every route, parameter and response field appears in `docs/openapi.json`
- A change to the public surface changes the OpenAPI description in the same
  commit

## Work Guidance

- Keep a route module short. When it grows past the point where the document
  shape is visible on one screen, split the shaping out
- Do not put a second endpoint's data in a route module. `/v1/models/{id}`
  reading recipe data is fine; `/v1/recipes` reaching into the origin route
  module is not
- Reuse the query engine in `src/lib/query.ts` rather than re-implementing
  filtering or sorting

## Verification

- `npm run test:integration` covers every route
- A new route lands with its test in the same change
- `npm run gates:openapi` proves the OpenAPI description and the route table
  still agree

## Child DOX Index

None. `src/routes` is a leaf.
