# Plan: hapi - the Heretic API

The design record for `hapi.sdad.pro`. This file states the contract that the
code implements. When the code and this file disagree, one of them is a bug.

## 1. What this is

One public, free, read-only JSON API over the Heretic (abliterated) model
ecosystem on Hugging Face. It merges the two backends that already exist in the
author's own projects and exposes them as one surface.

| Source project | What it contributes |
| --- | --- |
| `heretic-live-agent` | Hub discovery (tag pass + name pass), pagination, dedup, global and per-creator download totals, download-rate estimation, Poisson download-event sampling |
| `heretico` | Model-card parsing (KL, refusals, benchmarks, base models, Heretic version), base-chain classification, canonical origin resolution, ablation recipe grouping, metric inheritance, quality scoring, Pareto frontiers, best picks, filtering, sorting, pagination |

The two projects stay exactly as they are. This repository is a new artifact that
reuses their proven logic rather than forking their product surfaces.

## 2. The domain model

Three entity levels. The distinction is the whole point of the API: a leaderboard
that ranked repositories would reward quant spam.

```
Origin  google/gemma-3-12b-it          one canonical upstream model
  |
  +-- Recipe  rcp_60b23972             one ablation attempt (one KL/refusal pair)
        |
        +-- Repo  coder3101/gemma-3-12b-it-heretic     the conversion (bf16)
        +-- Repo  mradermacher/...-GGUF               a quantized artifact
```

- **Origin** - the model a newcomer searches for. Many artifacts, many recipes.
- **Recipe** - one ablation attempt, identified by `(origin, author, kl, refusals,
  refusalTotal, hereticVersion)`. Published as one or several repos. This is what
  a leaderboard ranks.
- **Repo** - one Hugging Face repository. An artifact of a recipe, never a rank.

### Invariants carried over from the source projects

1. **Never invent a metric.** A card that does not publish KL and refusals yields
   an unranked recipe. `score` is `0` and `ranked: false` says so.
2. **Corroboration outranks score.** A recipe is `verified` when its evidence repo
   ships real weights (GBs of upload) and reports a physically possible KL. An
   unverified recipe may rank, but never holds rank 1.
3. **KL has a floor.** `KL_FLOOR = 1e-4`. Below it the number is not a measurement
   and the recipe is flagged `implausible`.
4. **Downloads are measurements; the per-second rate is not.** `downloadsPerSecond`
   is extrapolated from the 30-day mean and is always labelled as derived.
5. **Card confidence tops out at `medium`.** Layout quality is not truth. Higher
   confidence comes from corroboration across artifacts, not from a tidy table.

## 3. The API contract

Base path `/v1`. Every response is JSON. Every response carries CORS headers
(`Access-Control-Allow-Origin: *`). Every error has the same shape.

### 3.1 Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1` | Service index: name, version, endpoint list, links |
| GET | `/v1/health` | Liveness plus dataset version and age in seconds |
| GET | `/v1/meta` | Dataset version, generation time, totals, families, counts, facets |
| GET | `/v1/summary` | Everything a homepage needs, in one request |
| GET | `/v1/families` | Model families with their origin and recipe counts |
| GET | `/v1/families/{slug}` | One family with its models and its ablations |
| GET | `/v1/versions` | The Heretic versions in use, with their counts |
| GET | `/v1/formats` | The artifact formats in use, with their counts |
| GET | `/v1/licenses` | The licenses in use, with their counts |
| GET | `/v1/tags` | The Hub tags in use, with their counts |
| GET | `/v1/kinds` | The repository kinds in use, with their counts |
| GET | `/v1/sizes` | The size classes in use, with their counts |
| GET | `/v1/models` | Origins. Filter, sort, paginate |
| GET | `/v1/models/{id}` | One origin with its recipes and its artifacts |
| GET | `/v1/recipes` | Ablation recipes. The leaderboard. Filter, sort, paginate |
| GET | `/v1/recipes/{id}` | One recipe with its origin and its artifacts |
| GET | `/v1/repos` | Artifacts. Filter, sort, paginate |
| GET | `/v1/repos/{id}` | One artifact with its recipe and origin |
| GET | `/v1/creators` | The creator leaderboard |
| GET | `/v1/creators/{username}` | One creator with their artifacts and their ablations |
| GET | `/v1/stats` | Global download totals, rate estimate, generation time |
| GET | `/v1/stats/{username}` | One creator's download totals, rate estimate and models |
| GET | `/v1/compare` | Two models side by side, with the difference spelled out |
| GET | `/v1/simulate` | Seeded Poisson download events for a given rate and window |
| GET | `/v1/parse` | Parse a live model card by repo id |
| GET | `/v1/openapi.json` | OpenAPI 3.1 description of this surface |
| GET | `/v1/dataset.json` | The whole dataset in one document, for bulk consumers |

### 3.2 Query parameters

Shared by `/v1/models`, `/v1/recipes`, `/v1/repos`:

| Parameter | Applies to | Meaning |
| --- | --- | --- |
| `q` | all | Free-text over id, name, author, tags and repo ids. Case-insensitive |
| `family` | all | Family slug. Exact match |
| `size` | all | Size class: `sub-1b`, `1-4b`, `4-9b`, `9-15b`, `15-32b`, `32-70b`, `70b-plus`, `unknown` |
| `format` | recipes, repos | Format slug: `gguf`, `safetensors`, `mlx`, `fp8`, `nvfp4`, `mxfp4`, `awq`, `gptq`, `exl`, `onnx`, `lora`, `other` |
| `kind` | recipes, repos | `heretic`, `quant`, `finetune`, `merge`, `lora`, `unknown` |
| `version` | recipes | Heretic version string. Exact match |
| `author` | repos | Creator id. Exact match |
| `origin` | repos | Origin id. Exact match |
| `license` | repos | License id. Exact match |
| `quant` | repos | Quantization label. Exact match |
| `verification` | recipes | `verified`, `unverified` or `publisher` |
| `confidence` | recipes | `high`, `medium`, `inherited` or `none` |
| `minDownloads` | all | Minimum all-time downloads |
| `minScore` | models, recipes | Minimum quality score |
| `maxKl` | models, recipes | Maximum divergence |
| `minLikes` | all | Minimum likes |
| `minParams`, `maxParams` | models, repos | Parameter bounds |
| `bench` | recipes, repos | `1` keeps only rows that published benchmarks |
| `ranked` | recipes | `0` includes unranked recipes. Default `1` |
| `pareto`, `bestPick` | recipes | `1` keeps only the frontier or only the best pick |
| `direct` | repos | `1` keeps only the direct conversions |
| `updatedAfter` | all | An ISO date the row must be newer than |
| `sort` | all | Sort key, see 3.3 |
| `dir` | all | `asc` or `desc`. Default depends on the sort key |
| `page` | all | 1-based page number |
| `perPage` | all | 25, 50, 100 or 200. Default 50 |

Unknown parameter values fall back to the default rather than erroring. A client
that sends `sort=bogus` gets the default sort, not a 400.

### 3.3 Sort keys

| Key | Applies to | Default direction |
| --- | --- | --- |
| `score` | recipes, models, creators | desc |
| `kl` | recipes, models | asc |
| `refusals` | recipes, models | asc |
| `downloads` | recipes, models, repos, creators | desc |
| `params` | models, recipes, repos | asc |
| `newest` | recipes, models, repos, creators | desc |
| `model` | models, recipes | asc |
| `author` | repos, creators | asc |
| `likes` | models, recipes, repos, creators | desc |
| `benchmarks` | recipes | desc |
| `recipes`, `repos` | models, recipes | desc |
| `models` | creators | desc |
| `created` | repos | desc |

### 3.4 Response envelope

List endpoints:

```json
{
  "updatedAt": "2026-10-21T09:00:00.000Z",
  "total": 1010,
  "page": 1,
  "pageCount": 21,
  "perPage": 50,
  "rows": [ ... ]
}
```

Detail endpoints return the entity plus its context (`origin`, `recipes`,
`repos`) in one document, so a client never needs a second round trip.

Error envelope, always the same shape:

```json
{
  "error": {
    "status": 404,
    "code": "not_found",
    "message": "No recipe matches that id.",
    "docs": "https://hapi.sdad.pro/v1/openapi.json"
  }
}
```

Codes: `bad_request`, `not_found`, `method_not_allowed`, `upstream_unavailable`,
`dataset_unavailable`, `internal_error`. Upstream messages are never echoed.

### 3.5 Caching

| Surface | `Cache-Control` |
| --- | --- |
| `/v1/meta`, `/v1/health` | `public, max-age=60, s-maxage=60, stale-while-revalidate=300` |
| `/v1/models`, `/v1/recipes`, `/v1/repos` and their details | `public, max-age=300, s-maxage=600, stale-while-revalidate=3600` |
| `/v1/stats` | `public, max-age=60, s-maxage=300, stale-while-revalidate=600` |
| `/v1/dataset.json` | `public, max-age=300, s-maxage=3600, stale-while-revalidate=86400` |
| `/v1/parse` | `public, max-age=300, s-maxage=3600` |
| any error | `no-store` |

Every list response carries an `ETag`. A conditional request with
`If-None-Match` answers `304` with no body.

## 4. Architecture

```
crawl (offline, pelican)          build (offline)             publish
  HF Hub listing + READMEs   ->   raw.json -> snapshot.json  ->  R2 objects
                                   -> dataset shards
  HF Hub listing (stats)    ->   stats.json, creators.json  ->  R2 objects
                                        |
                                        v
                              GET /v1/*  (Worker, read-only)
                                 store -> dataset -> query -> json
```

The API never crawls the Hub during a request. The only exception is the
explicit `GET /v1/parse` endpoint, which fetches exactly one card.

### 4.1 Module layout

| Path | Role | May touch |
| --- | --- | --- |
| `src/core/` | Pure domain logic. Ported from the two source projects | Nothing |
| `src/lib/` | Dataset model, query engine, HTTP helpers, store interface | Nothing outside the process |
| `src/routes/` | One module per endpoint family | The store, the query engine |
| `scripts/` | The offline pipeline | The network, the filesystem, the store |
| `test/` | The suites and the gate harness | Nothing |

`src/core/` is where the proof lives. It is the ported, already-tested logic, so
the offline test suite is fast and deterministic.

### 4.2 The dataset

The pipeline publishes these objects:

| Object | Contents | Approximate size |
| --- | --- | --- |
| `meta.json` | version, generation time, source, totals, families, counts, facets | 60 KB |
| `models.json` | origins | 700 KB |
| `recipes.json` | recipes, plus the origin fields each row needs | 900 KB |
| `repos.json` | artifacts | 2 MB |
| `creators.json` | creators with their totals and their models | 400 KB |
| `stats.json` | the indexed and the discovered download totals, and the rate | 2 KB |
| `dataset.json` | everything above in one document | 4 MB |

The store is split per entity family on purpose. A request for `/v1/repos` must
not pay the parse cost of the recipe and origin data, and vice versa. The
dataset is loaded lazily per family and memoized per isolate.

### 4.3 The store

One interface, two implementations:

```ts
interface DatasetStore {
  get(key: string): Promise<string | null>
}
```

- `R2Store` - a Cloudflare R2 bucket binding
- `FileStore` - a directory on disk, for development and for the test suite

The handler never assumes a binding is present. A missing dataset answers
`503 dataset_unavailable` with a plain sentence, never a stack trace.

## 5. The pipeline

Runs on the author's own server, never inside a request.

| Step | Command | Produces |
| --- | --- | --- |
| Crawl | `npm run crawl` | `data/raw.json` plus a per-repo card cache |
| Build | `npm run build:dataset` | `data/snapshot.json` plus `dist/*.json` |
| Stats | `npm run build:stats` | `dist/stats.json` |
| Publish | `npm run publish` | The dataset objects in the configured bucket |
| Refresh | `npm run refresh` | Crawl, build, stats and publish in order |

The crawl is incremental. A repo whose `sha` has not changed reuses its cached
parse, so a refresh only fetches new or edited READMEs. A parser change bumps
`PARSER_VERSION` and the cached markdown is re-parsed locally, with no network
round trip.

Publishing is content-addressed: an object whose bytes did not change is not
re-uploaded.

## 6. Depth tree

```
hapi (root)
├── src
│   ├── core            pure domain logic            leaf
│   ├── lib             dataset model, query, http   leaf
│   └── routes          endpoint surface              leaf
├── scripts             offline pipeline              leaf
├── test                suites and gates              leaf
└── docs                openapi and hosting guides    leaf
```

Every leaf is a leaf. There is no deeper nesting to justify, and a folder that
cannot state its own contract does not deserve an `AGENTS.md`.

## 7. Non-goals

- No accounts, no keys, no signup, no rate-limit tiers
- No writes. The API is read-only by construction
- No proxying of arbitrary Hugging Face URLs. `/v1/parse` accepts a repo id, not a URL
- No live crawling during a request
- No model weights, no inference, no benchmarking
