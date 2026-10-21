# src/core

## Purpose

Pure domain logic. The proven behaviour of the two source projects, ported into
one place: model-card parsing, base-chain classification, origin resolution,
recipe grouping, metric inheritance, quality scoring, and the live download
statistics core.

Nothing in this folder touches the network, the filesystem, the clock or the
environment. That is what lets the whole suite run offline and fast, and it is
why the code is here rather than in `src/lib`.

## Ownership

- `markdown.ts` - the model-card Markdown primitives: tables, prose lines, cell
  cleanup, number and refusal shapes
- `card.ts` - the model-card parser. Extracts base models, Heretic version, KL,
  refusals, benchmarks, license, languages, quantizer, format hints and kind hints
- `naming.ts` - parameter estimation, size classes, family rules, quant labels
  and format detection
- `scoring.ts` - quality score, refusal rate, capability retention, rankability,
  Pareto frontier, leaderboard order and best pick
- `classify.ts` - repo kind classification and canonical origin resolution
- `recipes.ts` - ablation recipe grouping, metric inheritance and the signature
  merge that folds re-uploads of one ablation together
- `live.ts` - the live download statistics core: discovery merging,
  deduplication, aggregation, rate estimation, Poisson event sampling
- `snapshot.ts` - the snapshot builder: classification, recipe grouping and
  origins assembled into one published document
- `types.ts` - the domain types shared by the whole project

## Local Contracts

### Purity

- No `fetch`, no `node:fs`, no `Date.now`, no `process.env`, no timers
- Every function that needs randomness takes the PRNG as a parameter. The
  default is `Math.random`, and a test passes its own
- Every function that needs "now" takes the timestamp as a parameter
- A module has no import-time side effect. Importing `src/core` must not start a
  crawl, read a file or touch the clock

### Ported behaviour is not to be improved casually

- The parser, classifier, scorer and live core are ported from projects that
  already have passing tests and real-world fixtures. Their behaviour is the
  specification. A change here is a change to those projects' meaning, not a
  refactor
- The one exception is a defect with a failing test that proves the defect.
  Write the test first, then fix it
- Do not add a dependency to a `core` module. `yaml` is the only runtime
  dependency in the whole project and it is used by `card.ts` alone

### Never invent a metric

- A card that does not publish KL and refusals yields `confidence: "none"` and
  an unranked recipe. The parser does not infer, average or impute
- `KL_FLOOR` in `recipes.ts` is the line below which a KL is not a measurement.
  It is not configurable
- Card confidence tops out at `medium`. Layout quality is not truth. Higher
  confidence comes from corroboration across artifacts, computed in `recipes.ts`

### Corroboration outranks score

- `scoring.ts` sorts verified rows ahead of unverified ones in every ordering.
  This is not a tiebreaker, it is a partition
- `bestPickId` returns `null` when nothing in the cohort is corroborated. An
  origin whose conversions all rest on one self-published card has no best
  version, and saying otherwise hands the top slot to the least verifiable row

### The live core is measurement plus derivation

- `downloadsAllTime` and `downloads` are measurements, straight from the Hub
- `estimateDownloadsPerSecond` is a derivation from the 30-day mean. It is
  labelled as such wherever it appears
- `sampleDownloadEvents` draws whole arrivals from a Poisson distribution, so a
  counter jumps like real traffic instead of creeping by a fractional average.
  It is deterministic given a seeded PRNG

## Work Guidance

- Keep each module to one concern. A module that grows a second responsibility
  gets split
- Port first, then adapt. A port that changes behaviour without a failing test
  is a bug, even when the new behaviour looks better
- The parse rules earn their complexity from real cards. When a rule looks
  overfitted, check the fixtures before simplifying it
- New parse rules need a fixture. A rule with no fixture is a rule nobody
  checked

## Verification

- `npm run test:unit` covers every module in this folder offline
- `npm run typecheck` must be clean
- A change to the parser bumps `PARSER_VERSION` in `scripts/lib/incremental.ts`
  so cached markdown is re-parsed rather than reused
- The canonical leaderboard order lives in `scoring.ts` and is shared with the
  publisher. A second copy of it would let the rank column and the row order
  drift apart

## Child DOX Index

None. `src/core` is a leaf.
