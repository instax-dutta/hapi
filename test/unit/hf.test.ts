import { test } from "node:test";
import assert from "node:assert/strict";
import { listAllModels } from "../../src/lib/hf.ts";
import { assertDiscovery } from "../../scripts/lib/discovery.ts";

/**
 * A rejected token and a malformed Hub answer both look like "no results" to
 * a caller that only checks `Array.isArray`. That is how a crawl silently
 * published an empty index and left the API on month-old data.
 */
test("an expired Hub token fails the crawl", async () => {
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ error: "OAuth token has expired" }), {
      status: 401,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  await assert.rejects(
    () => listAllModels({ filter: "heretic" }, { fetchImpl: fakeFetch, retries: 1 }),
    /401|token/i,
  );
});

test("a non-list Hub answer fails the crawl", async () => {
  const fakeFetch = (async () =>
    new Response(JSON.stringify({ error: "bad gateway" }), {
      status: 200,
      headers: { "content-type": "application/json" },
    })) as typeof fetch;

  await assert.rejects(
    () => listAllModels({ filter: "heretic" }, { fetchImpl: fakeFetch, retries: 1 }),
    /invalid model list/i,
  );
});

test("an empty discovery is a failure, not an empty index", () => {
  assert.throws(() => assertDiscovery([]), /no models/i);
  assert.doesNotThrow(() => assertDiscovery([{ id: "owner/model" }]));
});
