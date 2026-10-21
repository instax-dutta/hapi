# Gates: hapi - the Heretic API

OWNS: src/**, scripts/**, test/**, docs/**, package.json, tsconfig.json, README.md, PLAN.md, AGENTS.md, GATES.md

Scope: a public, free, read-only JSON API over the Heretic model ecosystem that combines the live download intelligence of `heretic-live-agent` with the directory logic of `heretico`, served from a published dataset.

- [ ] G1: The codebase typechecks without errors
  CHECK: node scripts/verify/gate.mjs typecheck
  EXPECT: TYPECHECK PASSED
  EVIDENCE: pending

- [ ] G2: The pure core passes its offline suite
  CHECK: node scripts/verify/gate.mjs unit
  EXPECT: UNIT SUITE PASSED
  EVIDENCE: pending

- [ ] G3: Every public endpoint answers through a real request
  CHECK: node scripts/verify/gate.mjs integration
  EXPECT: INTEGRATION SUITE PASSED
  EVIDENCE: pending

- [ ] G4: The OpenAPI description and the implemented routes agree
  CHECK: node scripts/verify/gate.mjs openapi
  EXPECT: OPENAPI VERIFIED
  EVIDENCE: pending

- [ ] G5: The published dataset satisfies its invariants
  CHECK: node scripts/verify/gate.mjs dataset
  EXPECT: DATASET VERIFIED
  EVIDENCE: pending

- [ ] G6: The DOX tree documents every durable boundary and is internally consistent
  CHECK: node scripts/verify/gate.mjs dox
  EXPECT: DOX VERIFIED
  EVIDENCE: pending

- [ ] G7: The whole verification passes in one run
  CHECK: node scripts/verify/gate.mjs all
  EXPECT: ALL GATES PASSED
  EVIDENCE: pending

- [ ] G8: A live crawl of the Hugging Face Hub produces a non-empty dataset
  CHECK: node scripts/verify/gate.mjs crawl
  EXPECT: CRAWL PASSED
  EVIDENCE: pending

- [ ] G9: The API answers over HTTP with the documented shape
  CHECK: node scripts/verify/gate.mjs serve
  EXPECT: SERVE PASSED
  EVIDENCE: pending
