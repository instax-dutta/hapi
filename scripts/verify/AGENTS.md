# scripts/verify

## Purpose

The verification harness. It runs the checks that prove the API works, and it
runs the gates that prove the acceptance criteria in `GATES.md` still hold.

## Ownership

- `gate.mjs` - the gate runner. One mode per gate, plus `all` for the offline
  set and `ledger` for every gate the ledger declares
- `all.mjs` - removed. The ledger runner replaced it
- `test.mjs` - the test runner. It finds the test files and hands them to the
  Node test runner explicitly, so the file pattern does not depend on the
  Node version
- `run.mjs` - runs a TypeScript entry point with Node's type stripping, and
  fails with a clear message on a Node too old to do it
- `openapi.mjs` - proves the OpenAPI description and the implemented routes
  agree: the paths, the parameters, the response schemas and the references
- `dataset.mjs` - proves the published dataset satisfies its invariants,
  re-derived from the published rows
- `dox.mjs` - proves the DOX tree is complete and internally consistent
- `crawl.mjs` - runs a small live crawl and proves it produces cards
- `serve.mjs` - starts the server and asks it the questions a client asks

## Local Contracts

### A gate has to be able to fail

- A check prints its success marker only after every assertion has passed
- A check exits nonzero the moment anything fails
- The ledger runner verifies the exit code and the marker. A check that passes
  without the marker is a failed check
- The ledger runner skips the gate that declares the ledger itself, because
  running it there would recurse

### The checks read the artifact, not a copy of it

- The dataset gate re-derives the frontier, the ranks and the totals from the
  published rows. It never copies a number from the build
- The OpenAPI gate reads the route table out of `src/index.ts` and the
  parameters out of the route modules. A second copy of the route table would
  drift
- The sample dataset is cut from a real snapshot, so the gates run against real
  data without a crawl

### The checks are offline unless they say otherwise

- The typecheck, the suites and the three document gates need no network and no
  server
- The crawl gate needs the Hub. It is bounded, so it stays a gate
- The serve gate needs a free port. It starts the server and stops it before it
  exits

## Work Guidance

- A new check is a new script with a success marker, and a gate in `GATES.md`
  that runs it
- A check that cannot fail is a broken check. Prove it by breaking the code it
  watches and watching the check fail
- Keep the checks portable. A check that needs `grep` does not run everywhere

## Verification

- `npm run gates` runs every gate the ledger declares
- `npm run gates:openapi`, `npm run gates:dataset` and `npm run gates:dox` run
  one check
- `npm run test:unit` and `npm run test:integration` run the suites

## Child DOX Index

None. `scripts/verify` is a leaf.
