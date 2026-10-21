# scripts

## Purpose

The offline pipeline. It crawls the Hugging Face Hub, parses the cards,
assembles the dataset, computes the download statistics and publishes the result
to the store the API reads from.

It runs on the author's own server on a schedule. It never runs inside a
request.

## Ownership

- `crawl.ts` - discover Heretic models on the Hub, fetch the READMEs that
  changed, write `data/raw.json` and the per-repo card cache
- `build-dataset.ts` - turn `data/raw.json` into `data/snapshot.json` and the
  published dataset objects in `dist/`
- `build-stats.ts` - compute the global download statistics into
  `dist/stats.json`. It publishes two scopes: the indexed artifacts and the
  wider discovered set
- `build-openapi.mjs` - generate `docs/openapi.json` from the spec module
- `publish.ts` - upload the dataset objects to the configured store
- `make-sample.mjs` - cut a committed sample dataset out of a directory
  snapshot, for the gate that checks the dataset invariants. Everything the
  sample publishes is re-derived from the slice
- `build-openapi.mjs` - generate `docs/openapi.json` from the spec module
- `lib/dataset-rows.ts` - the conversion from a directory snapshot into the
  published API rows, the facets and the creators
- `lib/pool.ts` - bounded-concurrency mapping that preserves input order
- `lib/incremental.ts` - the card cache decision: fetch, reuse or re-parse

## Local Contracts

### The crawl is polite and incremental

- Two discovery passes run in parallel: `filter=heretic` for the tag and
  `search=heretic` for the name. The tagged pass wins on a duplicate
- Every Hub request is bounded by a timeout and retried with backoff. A 429 or
  a 5xx is retried; a 404, 401 or 403 is not
- A repo whose `sha` has not changed reuses its cached parse. Only changed or
  new READMEs are fetched
- A parser change bumps `PARSER_VERSION` and the cached markdown is re-parsed
  locally, with no network round trip
- Concurrency is bounded and configurable. The default is gentle
- A repo whose README cannot be fetched keeps its previous cache entry. A
  transient failure must not turn an indexed repo into a missing one

### The build never publishes a broken dataset

- The build refuses to write a snapshot with no origins or no recipes. An empty
  index is a failure, not a result
- The build is deterministic. The same input produces the same bytes, so a
  refresh that changed nothing publishes nothing. The timestamp comes from the
  crawl, never from the clock, and the published ordering never depends on the
  runtime's locale
- The dataset objects are written atomically. A half-written object is never
  visible
- `build-stats` refuses to publish a measurement when the artifact list is
  missing or empty

### Publishing is content addressed

- An object whose bytes did not change is not re-uploaded
- Publishing is idempotent. Running it twice changes nothing the second time
- The state is kept per bucket, so publishing to one bucket never cancels a
  publish to another
- Without a bucket the script does nothing and says so: the dataset is already
  in `dist/`, which is where the Node server reads it from
- Credentials come from the environment at publish time only. Nothing secret
  reaches the repository, the dataset or the API

### The pipeline shares the core

- The pipeline imports the parser, the classifier, the scorer and the live
  statistics core from `src/core`. It does not reimplement them
- The pipeline is the only place that reads and writes the filesystem outside
  `test/`

## Work Guidance

- A new pipeline step is a new script with its own entry point and its own
  `package.json` script. Do not grow one script into a switchboard
- Keep the Hub client in `lib/hf.ts`. A second place that knows how to talk to
  the Hub is a second place that forgets the timeout
- The crawl is the slowest step. When it is slow, look for an unnecessary
  README fetch before looking for a slower machine

## Verification

- `npm run test:unit` covers the pipeline helpers that hold logic: the card
  cache decision, the bounded pool and the conversion into the published rows
- `npm run crawl -- --limit 20` against the live Hub is the smoke test for the
  crawl
- `npm run build:dataset` against a committed `data/raw.json` proves the build
- `npm run gates:dataset` proves the published dataset satisfies its invariants

## Child DOX Index

None. `scripts` is a leaf.
