import { test } from "node:test";
import assert from "node:assert/strict";
import { applyConditional, corsHeaders, etagOf, errorResponse, json } from "../../src/lib/http.ts";
import { matchRoute, type Route } from "../../src/router.ts";

test("the CORS headers open the API to any origin", () => {
  const headers = corsHeaders();
  assert.equal(headers["Access-Control-Allow-Origin"], "*");
  assert.ok(headers["Access-Control-Allow-Methods"].includes("GET"));
  assert.ok(headers["Access-Control-Allow-Methods"].includes("OPTIONS"));
  assert.ok(headers["Access-Control-Allow-Headers"].includes("If-None-Match"));
});

test("a JSON response carries the CORS headers and an ETag", async () => {
  const response = json({ hello: "world" });
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
  assert.ok(response.headers.get("ETag"));
  assert.match(response.headers.get("Content-Type") ?? "", /application\/json/);
  assert.deepEqual(await response.json(), { hello: "world" });
});

test("an error response is never cached", () => {
  const response = errorResponse(404, "not_found", "Nothing here.");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
});

test("an error response always has the same shape", async () => {
  const body = (await errorResponse(400, "bad_request", "Nope.").json()) as {
    error: { status: number; code: string; message: string; docs: string };
  };
  assert.equal(body.error.status, 400);
  assert.equal(body.error.code, "bad_request");
  assert.equal(body.error.message, "Nope.");
  assert.match(body.error.docs, /openapi/);
});

test("the ETag changes when the body changes", () => {
  assert.notEqual(etagOf("a"), etagOf("b"));
  assert.equal(etagOf("a"), etagOf("a"));
});

test("a matching If-None-Match answers 304 with no body", () => {
  const response = json({ a: 1 });
  const etag = response.headers.get("ETag")!;
  const conditional = applyConditional(
    new Request("https://example.com/", { headers: { "If-None-Match": etag } }),
    response,
  );
  assert.equal(conditional.status, 304);
  assert.equal(conditional.body, null);
});

test("a stale If-None-Match answers the body", () => {
  const response = json({ a: 1 });
  const conditional = applyConditional(
    new Request("https://example.com/", { headers: { "If-None-Match": '"stale"' } }),
    response,
  );
  assert.equal(conditional.status, 200);
});

const routes: Route[] = [
  { method: "GET", pattern: "/v1", handler: () => new Response("index") },
  { method: "GET", pattern: "/v1/models", handler: () => new Response("models") },
  { method: "GET", pattern: "/v1/models/:id*", handler: () => new Response("model") },
  { method: "GET", pattern: "/v1/recipes/:id", handler: () => new Response("recipe") },
];

test("a path matches its route", () => {
  const { match } = matchRoute(routes, "GET", "/v1/models");
  assert.equal(match?.route.pattern, "/v1/models");
});

test("an id that contains a slash is captured whole", () => {
  const { match } = matchRoute(routes, "GET", "/v1/models/google/gemma-3-12b-it");
  assert.equal(match?.params.id, "google/gemma-3-12b-it");
});

test("a single-segment id is captured", () => {
  const { match } = matchRoute(routes, "GET", "/v1/recipes/rcp_60b23972");
  assert.equal(match?.params.id, "rcp_60b23972");
});

test("a path that exists under another method is reported separately", () => {
  const { match, pathExists } = matchRoute(routes, "POST", "/v1/models");
  assert.equal(match, null);
  assert.equal(pathExists, true);
});

test("a path that does not exist is not reported as existing", () => {
  const { match, pathExists } = matchRoute(routes, "GET", "/v1/nope");
  assert.equal(match, null);
  assert.equal(pathExists, false);
});
