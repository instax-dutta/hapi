# Gates: hapi - the Heretic API

OWNS: src/**, scripts/**, test/**, docs/**, package.json, tsconfig.json, README.md, PLAN.md, AGENTS.md, GATES.md

Scope: a public, free, read-only JSON API over the Heretic model ecosystem that combines the live download intelligence of `heretic-live-agent` with the directory logic of `heretico`, served from a published dataset.

- [x] G1: The codebase typechecks without errors
  CHECK: node scripts/verify/gate.mjs typecheck
  EXPECT: TYPECHECK PASSED
  EVIDENCE: TYPECHECK PASSED on Node 22.23.3 (pelican), 0 errors across src, scripts and test

- [x] G2: The pure core passes its offline suite
  CHECK: node scripts/verify/gate.mjs unit
  EXPECT: UNIT SUITE PASSED
  EVIDENCE: UNIT SUITE PASSED, 74 tests, 0 failed, 0.4s, no network and no clock

- [x] G3: Every public endpoint answers through a real request
  CHECK: node scripts/verify/gate.mjs integration
  EXPECT: INTEGRATION SUITE PASSED
  EVIDENCE: INTEGRATION SUITE PASSED, 61 tests, 0 failed, covering 27 routes, the CORS headers, the error envelope, the ETag and the 503 path

- [x] G4: The OpenAPI description and the implemented routes agree
  CHECK: node scripts/verify/gate.mjs openapi
  EXPECT: OPENAPI VERIFIED
  EVIDENCE: OPENAPI VERIFIED, 27 documented paths and 27 implemented routes, and docs/openapi.json byte-identical to the generated description

- [x] G5: The published dataset satisfies its invariants
  CHECK: node scripts/verify/gate.mjs dataset
  EXPECT: DATASET VERIFIED
  EVIDENCE: DATASET VERIFIED on the committed sample, 40 models, 29 recipes, 81 artifacts. The invariants are re-derived from the published rows: every ranked recipe has a positive divergence, no unverified recipe holds a best pick, the frontier flags recompute, and every recipe agrees with the artifact it cites as evidence. A live build on pelican (1200 repositories, 1021 published artifacts) passes the same check

- [x] G6: The DOX tree documents every durable boundary and is internally consistent
  CHECK: node scripts/verify/gate.mjs dox
  EXPECT: DOX VERIFIED
  EVIDENCE: DOX VERIFIED, 7 documents checked, every child listed in its parent index, no emoji and no em dash

- [x] G7: The whole verification passes in one run
  CHECK: node scripts/verify/gate.mjs all
  EXPECT: ALL GATES PASSED
  EVIDENCE: ALL GATES PASSED, 6 gates on Node 22.23.3 (pelican)

- [x] G8: A live crawl of the Hugging Face Hub produces a non-empty dataset
  CHECK: node scripts/verify/gate.mjs crawl
  EXPECT: CRAWL PASSED
  EVIDENCE: CRAWL PASSED, 1200 repositories discovered and 1199 cards parsed with 0 fetch errors. The full run discovered 8298 models (6310 tagged, 6942 named) and cached 3390 cards before the anonymous Hub rate limit set in

- [x] G9: The API answers over HTTP with the documented shape
  CHECK: node scripts/verify/gate.mjs serve
  EXPECT: SERVE PASSED
  EVIDENCE: SERVE PASSED, the Node server answered the index, the model list, the recipe list, the statistics, an unknown recipe and a HEAD request over loopback. The same server answered the same shapes against the live build of 1021 artifacts
