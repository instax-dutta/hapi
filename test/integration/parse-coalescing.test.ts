import { test } from "node:test";
import assert from "node:assert/strict";
import handler from "../../src/index.ts";
import { fixtureStore } from "../helpers/fixtures.ts";

/**
 * The parse route is the only endpoint that reaches the Hub. A burst for the
 * same card must coalesce into one fetch, or N clients cost N Hub round trips.
 */
test("concurrent parses of one repo share a single Hub fetch", async () => {
  const repo = "coalesce-test/one-card";
  const original = globalThis.fetch;
  let readmeFetches = 0;

  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/raw/main/")) {
      readmeFetches += 1;
      // Delay so both requests are in flight before either cache is written.
      await new Promise((resolve) => setTimeout(resolve, 20));
      return new Response("# A test card\n", { status: 200 });
    }
    if (url.includes("/api/models/")) {
      return new Response(JSON.stringify({ id: repo }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    return new Response("not found", { status: 404 });
  }) as typeof fetch;

  try {
    const url = `https://hapi.thevinod.lol/v1/parse?repo=${repo}`;
    const [first, second] = await Promise.all([
      handler.fetch(new Request(url), { HAPI_STORE: fixtureStore() }, undefined),
      handler.fetch(new Request(url), { HAPI_STORE: fixtureStore() }, undefined),
    ]);

    assert.equal(first.status, 200);
    assert.equal(second.status, 200);
    assert.equal(readmeFetches, 1, "two concurrent parses fetched the same README twice");
  } finally {
    globalThis.fetch = original;
  }
});
