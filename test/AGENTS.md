# test

## Purpose

The executable specification. Unit suites for the pure core, integration suites
for the HTTP surface, fixtures from the real world, and the gate harness that
proves the acceptance criteria in `GATES.md`.

## Ownership

- `unit/` - the pure domain logic and the pipeline helpers. Offline,
  deterministic, fast
- `integration/` - the routes, driven through a real `Request` and a fake store
- `fixtures/cards/` - real Hugging Face model cards
- `fixtures/dataset/` - a committed sample of the published dataset, cut from
  a real snapshot. The dataset gate checks it
- `helpers/` - the fake store and the dataset builders

## Local Contracts

### TDD, without exception

- Every behaviour change lands as a failing test first. The test is run and
  seen to fail for the right reason before the implementation is written
- A test that is written after the code and never seen red is a comment, not a
  test
- A test asserts a behaviour, not an implementation detail. Assert on the
  public shape of a document, not on the name of a private helper

### Determinism

- No test touches the network, the real clock or a random source it does not
  seed
- A test that needs randomness passes a seeded PRNG
- A test that needs "now" passes the timestamp
- The suites must finish in seconds. Anything slower belongs in the pipeline

### Negative cases matter more than happy paths

- The parser: trial logs, quantization noise, base-model cycles, missing
  denominators, cards that resolve to themselves
- The scorer: a fabricated card that claims zero refusals and zero KL, a cohort
  where nothing is corroborated, a KL below the floor
- The routes: an unknown sort key, a page past the end, an unknown entity, a
  missing dataset, an upstream failure

### Fixtures are real

- `fixtures/cards/` holds verbatim Hugging Face model cards. Do not edit them.
  They are the ground truth for the parser
- A new card shape the parser claims to support needs a fixture in the same
  change
- The sample dataset in `fixtures/dataset/` is small on purpose. It proves
  behaviour, it does not prove scale

### The gate harness

- `npm run verify` runs the typecheck, the unit suites, the integration suites
  and the gate harness, in that order
- The gate harness reads `GATES.md` and proves every runnable gate. It does not
  decide whether a gate is honest; it proves the declared command passes
- A gate that cannot fail is a broken gate. The harness lints for that

## Work Guidance

- Prefer table-driven cases for the parser and the naming rules. One `it.each`
  beats twenty `it` blocks
- Do not weaken an assertion to make a change pass. Change the code instead
- Keep a fixture that documents a bug. A regression test without the fixture
  that caused it will be deleted by the next person who does not understand it

## Verification

- `npm run verify` - the whole thing. This is the command that must pass
- `npm run test:unit` - the pure core and the pipeline helpers
- `npm run test:integration` - the routes only
- `npm run gates` - the acceptance gates in `GATES.md`

## Child DOX Index

None. `test` is a leaf.
