# Hosting on Cloudflare Workers

The API is a `fetch(request, env, ctx)` handler with a `DatasetStore`
interface. On Cloudflare the store is an R2 bucket. Nothing in the request path
imports a Node built-in, so the Worker bundle stays small.

This guide assumes a Cloudflare account. If you do not have one, use
[node.md](node.md) instead: the same code runs on a plain Node process.

## What you need

- A Cloudflare account
- A Workers project (`npm create wrangler@latest`)
- One R2 bucket for the dataset
- A domain or a `workers.dev` subdomain

## 1. The bucket

```bash
npx wrangler r2 bucket create hapi
```

The bucket holds the published dataset. The pipeline writes seven objects:

| Object | Contents |
| --- | --- |
| `meta.json` | The version, the totals, the families and the facets |
| `models.json` | The origins |
| `recipes.json` | The ablations |
| `repos.json` | The artifacts |
| `creators.json` | The creators |
| `stats.json` | The global download statistics |
| `dataset.json` | Everything in one document, for bulk consumers |

## 2. The Worker

`wrangler.toml`:

```toml
name = "hapi"
main = "src/index.ts"
compatibility_date = "2026-10-01"

[build]
command = ""

[[r2_buckets]]
binding = "HAPI_BUCKET"
bucket_name = "hapi"

[observability]
enabled = true
```

The binding name matters: the handler looks for `env.HAPI_BUCKET`.

Deploy:

```bash
npx wrangler deploy
```

## 3. Publish the dataset

The pipeline runs on your own machine, not on the Worker. It writes the objects
into R2 through the Wrangler CLI:

```bash
npm run crawl
npm run build:dataset
npm run build:stats
npm run publish -- --r2 hapi
```

`publish` is content addressed. An object whose bytes did not change is not
uploaded again, so a refresh that found nothing new costs one command and no
bandwidth.

## 4. The domain

Point the domain at the Worker. In the Cloudflare dashboard, under
**Workers and Pages**, open the `hapi` worker, then **Settings** and
**Triggers and Bindings** to add a custom domain.

`hapi.sdad.pro` is a subdomain of `sdad.pro`. The zone is on Cloudflare, so the
record is a Worker route rather than a DNS `A` record.

## 5. The cache

The responses already carry `Cache-Control` with `s-maxage`. On the Workers free
plan the edge does not cache a Worker response by itself, so the Worker writes
to the Cloudflare cache explicitly. If you see a lot of repeat traffic, add the
Cache API to the handler:

```ts
const cache = caches.default;
const cached = await cache.match(request);
if (cached) return cached;
const response = await handle(request);
ctx.waitUntil(cache.put(request, response.clone()));
return response;
```

The `Cache-Control` values in `src/lib/http.ts` are already the right ones for
that.

## The free tier

The free plan gives 100,000 requests a day and 10 ms of CPU per request. Two
things follow from that, and both are handled by the architecture:

- **CPU.** The dataset is parsed once per isolate and memoized, so the parse
  cost is not paid per request. The dataset is split per entity family, so a
  request for the artifact list does not pay for the origin data. If a request
  still comes close to the limit, move the dataset into a Durable Object, which
  gets 30 seconds of CPU per request
- **Subrequests.** The handler makes one R2 read per request. The pipeline does
  the Hub traffic, not the request path. The one exception is `/v1/parse`,
  which fetches a single card

If the request volume outgrows 100,000 a day, the Workers paid plan is $5 a
month and removes both limits.

## The schedule

Run the pipeline on a timer. On the author's own server:

```cron
17 */2 * * * cd /home/tejes/work/hapi && npm run refresh >> data/refresh.log 2>&1
```

Every two hours is enough. The crawl is incremental, so a run that finds no
change is cheap. The API answers from the published dataset, so the cadence
only decides how fresh the download totals are.
