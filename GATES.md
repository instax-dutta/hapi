# Gates: hapi - the Heretic API

OWNS: src/**, scripts/**, test/**, docs/**, package.json, tsconfig.json, README.md, PLAN.md, AGENTS.md, GATES.md

Scope: a public, free, read-only JSON API over the Heretic model ecosystem that combines the live download intelligence of `heretic-live-agent` with the directory logic of `heretico`, served from a published dataset.

## What was measured

Every gate below was executed on the author's own server (Node 22.23.3, Linux
x86_64) against this exact tree, and the recorded evidence is bound to the
command that produced it.

- 74 unit tests and 61 integration tests pass, with no network and no clock
- 27 routes are implemented and 27 are documented, and the two agree
- The committed sample dataset satisfies every invariant: a ranked recipe has a
  positive divergence, no unverified recipe holds a best pick, the Pareto
  flags recompute from the published rows, and every recipe agrees with the
  artifact it cites as evidence
- A live crawl of the Hugging Face Hub discovered 8298 models (6310 tagged,
  6942 named) and parsed 3390 cards before the anonymous rate limit set in
- The Node server answered the index, the model list, the recipe list, the
  statistics, an unknown recipe and a HEAD request over loopback, against both
  the committed sample and a live build of 1021 artifacts

The full corpus needs a Hugging Face token for the crawl. The token is a
secret and never reaches the repository, the dataset or the API.

## What was measured

Every gate below was executed on the author's own server (Node 22.23.3, Linux
x86_64) against this exact tree, and the recorded evidence is bound to the
command that produced it.

- 74 unit tests and 61 integration tests pass, with no network and no clock
- 27 routes are implemented and 27 are documented, and the two agree
- The committed sample dataset satisfies every invariant: a ranked recipe has a
  positive divergence, no unverified recipe holds a best pick, the Pareto
  flags recompute from the published rows, and every recipe agrees with the
  artifact it cites as evidence
- A live crawl of the Hugging Face Hub discovered 8298 models (6310 tagged,
  6942 named) and parsed 3390 cards before the anonymous rate limit set in
- The Node server answered the index, the model list, the recipe list, the
  statistics, an unknown recipe and a HEAD request over loopback, against both
  the committed sample and a live build of 1021 artifacts

The full corpus needs a Hugging Face token for the crawl. The token is a
secret and never reaches the repository, the dataset or the API.

- [x] G1: The codebase typechecks without errors
  CHECK: node scripts/verify/gate.mjs typecheck
  EXPECT: TYPECHECK PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=fa35d000bcd4519da68f25e4a0ed998b9fae99ccaabeadce77147e6c546adb13; exit=0; EXPECT=matched; output-sha256=c5776413b12e6ff492f30c328fbbb5dea84034aa7153298f9513407f43e8bc05; output-bytes=17; shell=/bin/sh; cwd=/home/tejes/work/hapi; path=f5a00065660f/9 entries

- [x] G2: The pure core passes its offline suite
  CHECK: node scripts/verify/gate.mjs unit
  EXPECT: UNIT SUITE PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=4b9c3578b54ac7d7acc39264fc9cc311dcbf17118276caff863335169679d6f0; exit=0; EXPECT=matched; output-sha256=4726d018b6cfd10df914494a23dc7bfbfa527f8840dbe97acfd7d358a6ba74f4; output-bytes=12731; shell=/bin/sh; cwd=/home/tejes/work/hapi; path=f5a00065660f/9 entries

- [x] G3: Every public endpoint answers through a real request
  CHECK: node scripts/verify/gate.mjs integration
  EXPECT: INTEGRATION SUITE PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=f040b408e13ca3fd34d363c578586f4ac8890b5cfae232ffcdf7c9ae4555287f; exit=0; EXPECT=matched; output-sha256=8ca5e2dcdb03a67122b0255fa1bff38ec3e1c6b0d3c3605509a99e7103b6fd71; output-bytes=11114; shell=/bin/sh; cwd=/home/tejes/work/hapi; path=f5a00065660f/9 entries

- [x] G4: The OpenAPI description and the implemented routes agree
  CHECK: node scripts/verify/gate.mjs openapi
  EXPECT: OPENAPI VERIFIED
  EVIDENCE: automatic-evidence=v1; definition-sha256=a9d3fbdbea47c855ab1ac0644725e7179d72a1ec1b028d4f265f2164cf600fee; exit=0; EXPECT=matched; output-sha256=93102ae432ebfc1c1216fc7cad4a6372ea86cc529b93dcf3c2e995f2d47c7837; output-bytes=95; shell=/bin/sh; cwd=/home/tejes/work/hapi; path=f5a00065660f/9 entries

- [x] G5: The published dataset satisfies its invariants
  CHECK: node scripts/verify/gate.mjs dataset
  EXPECT: DATASET VERIFIED
  EVIDENCE: automatic-evidence=v1; definition-sha256=ef16bc1d6453cf2ae3315c6db6f29bb3ef918b54fa1b1da2e2961aec9013061d; exit=0; EXPECT=matched; output-sha256=de4d07356f1e53aaec4d0c7a67cb519c9966802193bbc8961471453341ca63bc; output-bytes=88; shell=/bin/sh; cwd=/home/tejes/work/hapi; path=f5a00065660f/9 entries

- [x] G6: The DOX tree documents every durable boundary and is internally consistent
  CHECK: node scripts/verify/gate.mjs dox
  EXPECT: DOX VERIFIED
  EVIDENCE: automatic-evidence=v1; definition-sha256=d712affde7f6c9c30b387119e7f8a2b8e5e9080d285f995ba20cdced9bdccf23; exit=0; EXPECT=matched; output-sha256=82b4f0c17d825f1d11c23a520803a989608c7ee35b60e28137a92b2f13feb5b7; output-bytes=60; shell=/bin/sh; cwd=/home/tejes/work/hapi; path=f5a00065660f/9 entries

- [x] G7: The whole verification passes in one run
  CHECK: node scripts/verify/gate.mjs all
  EXPECT: ALL GATES PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=670a164541c6c699d6bb3717e5ccf17b80f09e62347f6fb0218bf8941876db6e; exit=0; EXPECT=matched; output-sha256=9a140c5703b9d32b7b3ab2bf2d485da0403b79b06d3c95907c73fccd94feafd8; output-bytes=24124; shell=/bin/sh; cwd=/home/tejes/work/hapi; path=f5a00065660f/9 entries

- [x] G8: A live crawl of the Hugging Face Hub produces a non-empty dataset
  CHECK: node scripts/verify/gate.mjs crawl
  EXPECT: CRAWL PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=df481e559c0fd583b25947dbe1f7238b5a69666528c4644776bf279d0dc1674d; exit=0; EXPECT=matched; output-sha256=8939cef78a88912fb8e75045629dfcf58d47ef16838beb91885223064708a20f; output-bytes=711; shell=/bin/sh; cwd=/home/tejes/work/hapi; path=f5a00065660f/9 entries

- [x] G9: The API answers over HTTP with the documented shape
  CHECK: node scripts/verify/gate.mjs serve
  EXPECT: SERVE PASSED
  EVIDENCE: automatic-evidence=v1; definition-sha256=a785ed5a3b423470aac022f31f6f159097ccf31896ca43ade60d1da9a6eba479; exit=0; EXPECT=matched; output-sha256=be67fb35c9c59991c7a42b20af6ff74ef32a7598a736d75246e9b58cd50d33e7; output-bytes=95; shell=/bin/sh; cwd=/home/tejes/work/hapi; path=f5a00065660f/9 entries
