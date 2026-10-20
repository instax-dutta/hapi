# DOX framework

- DOX is highly performant AGENTS.md hierarchy installed here
- Agent must follow DOX instructions across any edits

## Core Contract

- AGENTS.md files are binding work contracts for their subtrees
- Work products, source materials, instructions, records, assets, and durable docs must stay understandable from the nearest applicable AGENTS.md plus every parent AGENTS.md above it

## Read Before Editing

1. Read the root AGENTS.md
2. Identify every file or folder you expect to touch
3. Walk from the repository root to each target path
4. Read every AGENTS.md found along each route
5. If a parent AGENTS.md lists a child AGENTS.md whose scope contains the path, read that child and continue from there
6. Use the nearest AGENTS.md as the local contract and parent docs for repo-wide rules
7. If docs conflict, the closer doc controls local work details, but no child doc may weaken DOX

Do not rely on memory. Re-read the applicable DOX chain in the current session before editing.

## Update After Editing

Every meaningful change requires a DOX pass before the task is done.

Update the closest owning AGENTS.md when a change affects:

- purpose, scope, ownership, or responsibilities
- durable structure, contracts, workflows, or operating rules
- required inputs, outputs, permissions, constraints, side effects, or artifacts
- user preferences about behavior, communication, process, organization, or quality
- AGENTS.md creation, deletion, move, rename, or index contents

Update parent docs when parent-level structure, ownership, workflow, or child index changes. Update child docs when parent changes alter local rules. Remove stale or contradictory text immediately. Small edits that do not change behavior or contracts may leave docs unchanged, but the DOX pass still must happen.

## Hierarchy

- Root AGENTS.md is the DOX rail: project-wide instructions, global preferences, durable workflow rules, and the top-level Child DOX Index
- Child AGENTS.md files own domain-specific instructions and their own Child DOX Index
- Each parent explains what its direct children cover and what stays owned by the parent
- The closer a doc is to the work, the more specific and practical it must be

## Child Doc Shape

- Create a child AGENTS.md when a folder becomes a durable boundary with its own purpose, rules, responsibilities, workflow, materials, or quality standards
- Work Guidance must reflect the current standards of the project or user instructions; if there are no specific standards or instructions yet, leave it empty
- Verification must reflect an existing check; if no verification framework exists yet, leave it empty and update it when one exists

Default section order:
- Purpose
- Ownership
- Local Contracts
- Work Guidance
- Verification
- Child DOX Index

## Style

- Keep docs concise, current, and operational
- Document stable contracts, not diary entries
- Put broad rules in parent docs and concrete details in child docs
- Prefer direct bullets with explicit names
- Do not duplicate rules across many files unless each scope needs a local version
- Delete stale notes instead of explaining history
- Trim obvious statements, repeated rules, misplaced detail, and warnings for risks that no longer exist

## Closeout

1. Re-check changed paths against the DOX chain
2. Update nearest owning docs and any affected parents or children
3. Refresh every affected Child DOX Index
4. Remove stale or contradictory text
5. Run existing verification when relevant
6. Report any docs intentionally left unchanged and why

## User Preferences

- No emojis in docs, code, comments, or API copy
- Use dashes, not em dashes
- Prefer fixing a problem at its source over layering a patch on top of it
- Keep changes scoped to the request; do not mix unrelated refactors into feature work
- Public, free, no keys, no signup: every endpoint is open and CORS-readable
- Build the API first; hosting is a later decision, so keep the runtime portable

---

## Project: hapi - Heretic API

A public, free, read-only JSON API for the Heretic (abliterated) model ecosystem on
Hugging Face. It combines the two backends of the author's own projects:

- `heretic-live-agent` - live download intelligence: Hub discovery, per-creator and
  global download totals, download-rate estimation
- `heretico` - the Heretic directory: model-card parsing, base-chain
  classification, canonical origin resolution, ablation recipe grouping, metric
  inheritance, KL/refusal scoring, Pareto frontiers, best picks, filtering and
  ranking

The API serves three entity levels, matching the domain:

- **Origin** - one canonical upstream model (`google/gemma-3-12b-it`)
- **Recipe** - one ablation attempt, possibly published as several artifacts
- **Repo** - one Hugging Face repository (an artifact: bf16, GGUF, FP8, ...)

### Domain rules

- Never invent a metric. A model card that does not publish KL and refusals yields
  an unranked artifact, and the API says so rather than guessing
- A fabricated card cannot take rank 1. Corroboration (real weights, physically
  possible KL) outranks score in every ordering
- Download totals are measurements. The derived per-second rate is an extrapolation
  from the 30-day mean and must never be labelled a measurement
- Public Hugging Face metadata only. No authentication, no private repos, no
  secrets, no environment variables at request time
- Every response is CORS-open (`Access-Control-Allow-Origin: *`) and cacheable
- Errors are JSON, always the same shape, never an upstream message leaked to the client

### Stack

- TypeScript, ESM, zero runtime dependencies except `yaml` (front matter parsing)
- Tests: Node built-in test runner (`node --test`) with TypeScript type stripping
- Runtime: a `fetch(request, env, ctx)` handler, portable across Cloudflare
  Workers and Node. The dataset store is an interface with a filesystem
  implementation for development and a Cloudflare R2 implementation for hosting
- Typecheck: `tsc --noEmit`

### Rules

- `src/core/` is pure: no network, no filesystem, no clock, no environment. It is
  the ported, already-proven logic and the tests run offline against it
- The API serves a pre-built dataset. It never crawls the Hub during a request
  except on the explicit `GET /v1/parse` endpoint
- The dataset is the single source of truth for every number the API returns
- Pure logic lands with its failing test first
- `npm run verify` must pass before a commit

### Documentation Map

- `README.md` - what the API is, endpoint reference, quickstart, local run
- `PLAN.md` - the design record: data model, endpoint contract, depth tree
- `GATES.md` - acceptance gates with their measured evidence
- `docs/openapi.json` - the OpenAPI 3.1 description of the public surface
- `docs/cloudflare.md` - hosting the API on Cloudflare Workers and R2
- `AGENTS.md` tree - per-directory contracts

## Child DOX Index

- `src/AGENTS.md` - request handling, routing, storage, dataset model
- `src/core/AGENTS.md` - pure domain logic ported from heretico and heretic-live-agent
- `src/routes/AGENTS.md` - the public endpoint surface
- `scripts/AGENTS.md` - the offline pipeline: crawl, build, publish
- `test/AGENTS.md` - test suites, fixtures and the gate harness
- `docs/AGENTS.md` - the OpenAPI description and hosting guides
