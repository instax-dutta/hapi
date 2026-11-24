# .github

## Purpose

Repository automation. It verifies every change and watches the public API.
The dataset itself is refreshed on the self-hosted server by
`scripts/refresh-server.mjs`; nothing here runs inside an API request.

## Ownership

- `workflows/ci.yml` - the full `npm run verify` on push and pull request
- `workflows/monitor.yml` - the scheduled check that the public API is fresh,
  answering and using the standard error envelope
- `dependabot.yml` - weekly npm and action updates, grouped to minor and patch

## Local Contracts

- Actions are pinned to commit SHAs. A floating tag is a mutable pointer
  running with a repository token
- Workflows use `pull_request`, never `pull_request_target`. Fork pull requests
  get a read-only token, so there are no secrets to leak
- The least privilege wins: read by default, issues write only in the jobs
  that open or close an issue
- One refresh at a time, with `cancel-in-progress: false`. A cancelled crawl
  could publish a half-built dataset
- The card cache is restored and saved around the crawl, and saved even when a
  later gate fails. One failed check must not force a full refetch from the
  rate-limited Hub
- Nothing is published until the offline gates and the built-dataset gate pass
- A green publish is not enough: the live API's dataset version must match the
  published one before the run succeeds
- Secrets are named in the workflow but never printed. `GITHUB_TOKEN` is
  supplied by the runner; `HEARTBEAT_URL` is optional. `HF_TOKEN` belongs to
  the server and never enters a workflow
- A failed check opens or keeps one issue; a successful check closes it. The
  heartbeat is the only alarm for a schedule that stops running entirely
- The monitor never writes to the API. It only reads the public endpoints

## Work Guidance

- A new automation step gets a matching assertion in
  `scripts/verify/automation.mjs`. A workflow nobody checks can be deleted
  without a gate failing
- A step that needs a credential checks it before doing expensive work
- Keep the refresh idempotent. A run that changes nothing publishes nothing

## Verification

- `node scripts/verify/automation.mjs` checks that the workflows carry the
  verification, cache, token check, publish check and failure reporting
- `npm run gates` runs that gate with the others
- YAML is parsed by the gate, so a syntax error fails before the workflow is
  pushed

## Child DOX Index

None. `.github` is a leaf.
