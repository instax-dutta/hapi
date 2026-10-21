# src/routes

## Purpose

The public endpoint surface. One module per endpoint family. Each module owns
its parameters, its document and its failure modes, and nothing else.

## Ownership

- `meta.ts` - `/v1`, `/v1/health`, `/v1/meta`, `/v1/families` and `/v1/families/{slug}`
- `models.ts` - `/v1/models` and `/v1/models/{id}`
- `recipes.ts` - `/v1/recipes` and `/v1/recipes/{id}`
- `repos.ts` - `/v1/repos` and `/v1/repos/{id}`
- `creators.ts` - `/v1/creators` and `/v1/creators/{username}`
- `stats.ts` - `/v1/stats` and `/v1/stats/{username}`
- `facets.ts` - `/v1/versions`, `/v1/formats`, `/v1/licenses`, `/v1/tags`,
  `/v1/kinds` and `/v1/sizes`
- `summary.ts` - `/v1/summary`
- `compare.ts` - `/v1/compare`
- `simulate.ts` - `/v1/simulate`
- `parse.ts` - `/v1/parse`
- `openapi.ts` - `/v1/openapi.json` and `/v1/dataset.json`
- `openapi-spec.ts` - the OpenAPI document itself. The single source of truth
  for the public surface

## Local Contracts

### One document per request

- A detail endpoint returns the entity together with its context. A client
  reading one origin gets its recipes and its artifacts in the same document
  and never needs a second round trip
- A paginated list endpoint returns the standard envelope: `updatedAt`, `total`,
  `page`, `pageCount`, `perPage`, `rows`. The families and the facet endpoints
  are not paginated, and they say which they are

### Never invent a metric

- An unranked recipe is returned with `ranked: false` and `score: 0`. It is
  never dropped silently and never given a score
- A recipe whose KL is below the floor is returned with `implausible: true`
- An artifact that inherited its numbers from another artifact is returned
  with `inheritedFrom` naming the artifact it inherited them from. The numbers
  themselves sit at the top level, under the same names the ablation uses

### Ordering

- Corroboration outranks score in every ordering, including a sort the client
  asked for, and including the lists a detail document carries. An unverified
  row can never sit at the top of any list
- The default sort of `/v1/recipes` is the canonical leaderboard order, so the
  sort key, the direction and the rank column always agree
- The canonical order lives in `src/core/scoring.ts` and is shared with the
  publisher. A second copy of it would let the rank column and the row order
  drift apart

### Failure

- A missing entity answers `404 not_found` with a sentence naming what was
  looked for
- A malformed parameter answers `400 bad_request` only when the parameter makes
  the request meaningless. A parameter with an unknown value falls back to its
  default
- `/v1/parse` is the only route that touches the network. An upstream failure
  answers `502 upstream_unavailable` with a plain sentence, never the upstream
  message

### Parameters

- A parameter is documented only where the route honours it. A parameter the
  description advertises and the route ignores is a filter that silently
  returns everything, which is worse than a rejected request
- `npm run gates:openapi` proves the two agree, in both directions

### OpenAPI

- Every route, parameter and response field appears in `docs/openapi.json`
- A change to the public surface changes the OpenAPI description in the same
  commit
- The description lives in `openapi-spec.ts`, not in the JSON file. The JSON is
  generated from it, so there is one source of truth
- Every path documents 405, and every path that reads the dataset documents
  503

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
