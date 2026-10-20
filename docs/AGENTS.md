# docs

## Purpose

The durable documentation that is not the README: the machine-readable
description of the public surface, and the hosting guides.

## Ownership

- `openapi.json` - the OpenAPI 3.1 description of every public endpoint
- `cloudflare.md` - hosting the API on Cloudflare Workers with an R2 dataset
- `node.md` - hosting the API on Node, for anyone who does not want Cloudflare

## Local Contracts

### The OpenAPI description is the contract

- Every route, parameter, response field and error code appears in
  `openapi.json`
- The description is served at `/v1/openapi.json` and is the same file
- A change to the public surface changes `openapi.json` in the same change
  as the code
- The description is validated in CI. A route that is not described, or a
  described route that does not exist, fails the gate

### The hosting guides are instructions, not essays

- A guide is a list of steps that can be followed in order, with the exact
  command and the exact expected output
- A guide states its assumptions. A guide that assumes a Cloudflare account
  says so in its first line
- No guide invents a credential. It says where the credential comes from

## Work Guidance

- Keep the OpenAPI description in one file. Splitting it makes it harder to
  read, not easier
- When the API and the description disagree, the API is right and the
  description is a bug. Fix the description in the same change

## Verification

- `npm run gates:openapi` validates `openapi.json` and proves it still matches
  the route table
- `npm run verify` includes that gate

## Child DOX Index

None. `docs` is a leaf.
