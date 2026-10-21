# hapi - the Heretic API

A public, free, read-only JSON API for the Heretic (abliterated) model ecosystem
on Hugging Face.

It merges the two backends of the author's own projects into one surface:

- **[heretic-live-agent](https://github.com/instax-dutta/heretic-live-agent)** - live
  download intelligence: Hub discovery, per-creator and global download totals,
  download-rate estimation
- **[heretico](https://github.com/instax-dutta/heretico)** - the Heretic directory:
  model-card parsing, base-chain classification, canonical origin resolution,
  ablation recipe grouping, metric inheritance, KL and refusal scoring, Pareto
  frontiers, best picks, filtering and ranking

No key. No account. No signup. Every response is CORS-open.

```
https://hapi.sdad.pro/v1/models?family=gemma-3&sort=kl&perPage=25
```

## The three entity levels

The distinction is the point. A leaderboard that ranked repositories would
reward quantization spam: one ablation published as eight formats is one
result, not eight.

| Level | What it is | Example |
| --- | --- | --- |
| **Origin** | One canonical upstream model | `google/gemma-3-12b-it` |
| **Recipe** | One ablation attempt. This is what a leaderboard ranks | `rcp_60b23972` |
| **Repo** | One published artifact | `coder3101/gemma-3-12b-it-heretic` |

## Endpoints

Base path `/v1`. Every response is JSON.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/v1` | The service index: name, version, every endpoint |
| GET | `/v1/health` | Liveness, dataset version and age in seconds |
| GET | `/v1/meta` | Totals, families, counts and the filter facets |
| GET | `/v1/summary` | Everything a homepage needs, in one request |
| GET | `/v1/families` | The model families |
| GET | `/v1/families/{slug}` | One family with its models and its ablations |
| GET | `/v1/versions` | The Heretic versions in use |
| GET | `/v1/formats` | The artifact formats in use |
| GET | `/v1/licenses` | The licenses in use |
| GET | `/v1/tags` | The Hub tags in use |
| GET | `/v1/kinds` | The repository kinds in use |
| GET | `/v1/sizes` | The size classes in use |
| GET | `/v1/models` | The origins. Filter, sort, paginate |
| GET | `/v1/models/{id}` | One origin with its recipes and its artifacts |
| GET | `/v1/recipes` | The ablations. The leaderboard |
| GET | `/v1/recipes/{id}` | One ablation with its origin and its artifacts |
| GET | `/v1/repos` | The published artifacts |
| GET | `/v1/repos/{id}` | One artifact with its ablation and its origin |
| GET | `/v1/creators` | The creator leaderboard |
| GET | `/v1/creators/{username}` | One creator with their artifacts and ablations |
| GET | `/v1/stats` | The global download totals and the derived rate |
| GET | `/v1/stats/{username}` | One creator's download totals, rate and models |
| GET | `/v1/compare` | Two models side by side, with the difference |
| GET | `/v1/simulate` | Seeded Poisson download events for a rate and a window |
| GET | `/v1/parse` | Parse a live model card by repository id. Cached per isolate |
| GET | `/v1/openapi.json` | The OpenAPI 3.1 description of this surface |
| GET | `/v1/dataset.json` | Every entity family in one document |

The full description, with every parameter and every field, is at
[`/v1/openapi.json`](docs/openapi.json).

## Querying

Four paginated list endpoints: `/v1/models`, `/v1/recipes`, `/v1/repos` and
`/v1/creators`. A parameter is honoured only where it is listed below, and the
OpenAPI description says the same thing. An unknown value falls back to the
default rather than failing, so a client never has to guess.

| Parameter | Endpoints | Meaning |
| --- | --- | --- |
| `q` | all four | Free-text over id, name, author, tags and repo ids |
| `family` | models, recipes, repos | Family slug |
| `size` | models, recipes, repos | `sub-1b`, `1-4b`, `4-9b`, `9-15b`, `15-32b`, `32-70b`, `70b-plus`, `unknown` |
| `format` | models, recipes, repos | `gguf`, `safetensors`, `mlx`, `fp8`, `nvfp4`, `mxfp4`, `awq`, `gptq`, `exl`, `onnx`, `lora`, `other` |
| `kind` | recipes, repos | `heretic`, `quant`, `finetune`, `merge`, `lora`, `unknown` |
| `version` | recipes, repos | The Heretic version |
| `author` | repos | The creator id |
| `origin` | repos | The origin id |
| `license` | repos | The license id |
| `quant` | repos | The quantization label, for example `Q4_K_M` |
| `verification` | recipes | `verified`, `unverified`, `publisher` |
| `confidence` | recipes | `high`, `medium`, `inherited`, `none` |
| `minDownloads` | all four | Minimum all-time downloads |
| `minScore` | models, recipes, creators | Minimum quality score |
| `maxKl` | models, recipes | Maximum divergence |
| `minLikes` | all four | Minimum likes |
| `minParams`, `maxParams` | models, repos | Parameter bounds |
| `bench` | recipes, repos | `1` keeps only rows that published benchmarks |
| `ranked` | recipes | `0` includes unranked ablations. Default `1` |
| `pareto`, `bestPick` | recipes | `1` keeps only the frontier or only the best pick |
| `implausible` | models, recipes | `0` drops the rows whose divergence is below the floor. `1` keeps only those |
| `direct` | repos | `1` keeps only the direct conversions |
| `updatedAfter` | models, recipes, repos | An ISO date the row must be newer than |
| `sort` | all four | See below |
| `dir` | all four | `asc` or `desc`. The default depends on the sort key |
| `page`, `perPage` | all four | `perPage` is 25, 50, 100 or 200. Default 50 |

Sort keys:

| Endpoint | Keys |
| --- | --- |
| `/v1/models` | `score`, `kl`, `refusals`, `refusalRate`, `downloads`, `recent`, `params`, `newest`, `model`, `recipes`, `repos`, `likes` |
| `/v1/recipes` | `score`, `kl`, `refusals`, `refusalRate`, `downloads`, `recent`, `params`, `newest`, `model`, `likes`, `benchmarks`, `repos` |
| `/v1/repos` | `downloads`, `recent`, `likes`, `params`, `newest`, `created`, `author`, `model` |
| `/v1/creators` | `downloads`, `recent`, `models`, `recipes`, `score`, `likes`, `newest`, `author` |

`downloads` is the all-time total. `recent` is the last thirty days, which is
the honest answer to "what is hot right now". `refusals` is the count of
refused tests and `refusalRate` is the share of them.

The default sort of `/v1/recipes` is the canonical leaderboard order, so the
`rank` column and the row order always agree.

## What the numbers mean

The API never invents a metric, and it never dresses a calculation up as a
measurement.

- **KL divergence and refusals** come from the model card. A card that does not
  publish them yields an unranked recipe: `ranked: false`, `score: 0`. It is
  served, and it says so.
- **Corroboration outranks score.** A recipe is `verified` when the artifact it
  cites ships real weights and reports a physically possible divergence. An
  unverified recipe still ranks, but it never holds the top slot. A fabricated
  card cannot win by writing two numbers.
- **`implausible`** marks a divergence below the floor an ablation can produce.
  Below it the number is not a measurement. The row is still served and still
  ranked, because hiding it would hide a real card. `?implausible=0` drops
  those rows for a client that wants only the measurements.
- **`downloadsAllTime` and `downloads30d`** are measurements, straight from the
  Hub.
- **`downloadsPerSecond`, `downloadsPerDay` and `refusalReduction`** are
  derivations. The rate carries `basis: "derived"` so a client cannot mistake
  it for a measurement.
- **`originalKl`, `originalRefusals` and `baseRefusalRate`** are the base
  model's own numbers, when the card published them side by side. They are what
  the ablation was measured against.
- **`evidence`** is the exact snippet the numbers were read from. Every number
  can be traced back to a line of a card.
- **`rank`, `originRank` and `familyRank`** are three positions: among the
  ranked ablations, among the ablations of the same model, and among the
  ablations of the same family. A leaderboard shows the first, a model page the
  second, a family page the third.
- **`url`** is the address on the Hub. A client never has to build one.
- **An artifact publishes the same fields as an ablation**: `kl`, `refusals`,
  `refusalTotal`, `confidence` and `evidence` sit at the top level, and
  `inheritedFrom` names the artifact an artifact inherited them from.

## The response envelope

List endpoints:

```json
{
  "updatedAt": "2026-10-21T09:00:00.000Z",
  "total": 1010,
  "page": 1,
  "pageCount": 21,
  "perPage": 50,
  "rows": []
}
```

Detail endpoints return the entity plus its context, so one request is enough.

Errors always have the same shape:

```json
{
  "error": {
    "status": 404,
    "code": "not_found",
    "message": "No recipe matches the id \"rcp_nope\".",
    "docs": "https://hapi.sdad.pro/v1/openapi.json"
  }
}
```

Codes: `bad_request`, `not_found`, `method_not_allowed`, `upstream_unavailable`,
`dataset_unavailable`, `internal_error`. An upstream message is never echoed to
the client.

## Caching and conditional requests

| Surface | `Cache-Control` |
| --- | --- |
| `/v1`, `/v1/health`, `/v1/meta`, `/v1/summary`, `/v1/families`, the six facet endpoints, `/v1/simulate`, `/v1/openapi.json` | `public, max-age=60, s-maxage=60, stale-while-revalidate=300` |
| The list and detail endpoints | `public, max-age=300, s-maxage=600, stale-while-revalidate=3600` |
| `/v1/stats`, `/v1/stats/{username}` | `public, max-age=60, s-maxage=300, stale-while-revalidate=600` |
| `/v1/parse` | `public, max-age=300, s-maxage=3600` |
| `/v1/dataset.json` | `public, max-age=300, s-maxage=3600, stale-while-revalidate=86400` |
| Any error | `no-store` |

Every response carries an `ETag`. Send `If-None-Match` and a matching response
answers `304` with no body.

## Running it

The API is a `fetch(request, env, ctx)` handler. The dataset store is an
interface, so the same code runs on a Worker or on Node.

```bash
npm install
npm run crawl            # discover the models and read their cards
npm run build:dataset    # assemble the published dataset
npm run build:stats      # compute the download statistics
npm run dev              # serve http://127.0.0.1:8787
```

`npm run build:openapi` regenerates `docs/openapi.json` from the spec module.
The `npm run gates:openapi` gate fails when the two have drifted apart.

```bash
curl http://127.0.0.1:8787/v1/recipes?sort=score\&perPage=5
```

`npm run verify` runs the typecheck, the unit suites, the integration suites
and the acceptance gates. It is the command that must pass before a commit.

## The pipeline

The API never crawls the Hub during a request. The pipeline does it offline and
publishes the result.

```
crawl      data/raw.json + the card cache
build      data/raw.json -> the published dataset objects
stats      the download statistics
publish    the dataset objects -> the store the API reads
refresh    all four, in order
```

The crawl is incremental. A repository whose `sha` has not changed reuses its
cached parse, so a refresh only fetches new or edited cards. A parser change
bumps `PARSER_VERSION` and the cached markdown is re-parsed locally, with no
network round trip.

## Hosting

The runtime is portable. The two guides are
[docs/cloudflare.md](docs/cloudflare.md) for Cloudflare Workers with an R2
bucket, and [docs/node.md](docs/node.md) for a plain Node process.

## The repository

| Path | Scope |
| --- | --- |
| `src/` | The runtime: handler, router, HTTP, store, dataset, query |
| `src/core/` | The pure domain logic, ported from the two source projects |
| `src/routes/` | The public endpoint surface |
| `scripts/` | The offline pipeline |
| `test/` | The suites, the fixtures and the gate harness |
| `docs/` | The OpenAPI description and the hosting guides |
| `AGENTS.md` | The DOX tree: the binding contract for every directory |

`PLAN.md` is the design record. `GATES.md` is the acceptance ledger.

## License

MIT for the code. The model weights and the model cards stay with their
authors. This project is an unaffiliated third-party observer of the upstream
Heretic project.
