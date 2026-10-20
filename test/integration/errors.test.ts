import { test } from "node:test";
import assert from "node:assert/strict";
import handler from "../../src/index.ts";
import { fixtureStore } from "../helpers/fixtures.ts";

function call(path: string, init: RequestInit = {}) {
  const request = new Request(`https://hapi.sdad.pro${path}`, init);
  return handler.fetch(request, { HAPI_STORE: fixtureStore() }, undefined);
}

test("a preflight is answered with no body and the CORS headers", async () => {
  const response = await call("/v1/models", { method: "OPTIONS" });
  assert.equal(response.status, 204);
  assert.equal(response.body, null);
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
});

test("a write method is refused with 405", async () => {
  const response = await call("/v1/models", { method: "POST" });
  assert.equal(response.status, 405);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, "method_not_allowed");
});

test("a write method on a path that does not exist is a 404", async () => {
  const response = await call("/v1/nope", { method: "POST" });
  assert.equal(response.status, 404);
});

test("an unknown path is a 404 with the standard shape", async () => {
  const response = await call("/v1/nope");
  assert.equal(response.status, 404);
  const body = (await response.json()) as { error: { status: number; code: string; message: string } };
  assert.equal(body.error.status, 404);
  assert.equal(body.error.code, "not_found");
  assert.ok(body.error.message.length > 0);
});

test("an error response carries the CORS headers", async () => {
  const response = await call("/v1/nope");
  assert.equal(response.headers.get("Access-Control-Allow-Origin"), "*");
});

test("an error response is never cached", async () => {
  const response = await call("/v1/nope");
  assert.equal(response.headers.get("Cache-Control"), "no-store");
});

test("a HEAD mirrors the GET status and headers with no body", async () => {
  const get = await call("/v1/models");
  const head = await call("/v1/models", { method: "HEAD" });
  assert.equal(head.status, get.status);
  assert.equal(head.headers.get("ETag"), get.headers.get("ETag"));
  assert.equal(head.headers.get("Content-Type"), get.headers.get("Content-Type"));
  assert.equal(head.body, null);
});

test("a conditional request answers 304 with no body", async () => {
  const first = await call("/v1/models");
  const etag = first.headers.get("ETag")!;
  const second = await call("/v1/models", { headers: { "If-None-Match": etag } });
  assert.equal(second.status, 304);
  assert.equal(second.body, null);
});

test("a list response is cacheable and a detail response is too", async () => {
  const list = await call("/v1/recipes");
  assert.match(list.headers.get("Cache-Control") ?? "", /s-maxage/);
  const detail = await call("/v1/recipes/rcp_a");
  assert.match(detail.headers.get("Cache-Control") ?? "", /s-maxage/);
});

test("an unknown entity is a 404 that names what was looked for", async () => {
  const response = await call("/v1/recipes/rcp_missing");
  assert.equal(response.status, 404);
  const body = (await response.json()) as { error: { message: string } };
  assert.ok(body.error.message.includes("rcp_missing"));
});

test("an unknown model is a 404", async () => {
  const response = await call("/v1/models/nobody/nothing");
  assert.equal(response.status, 404);
});

test("an unknown artifact is a 404", async () => {
  const response = await call("/v1/repos/nobody/nothing");
  assert.equal(response.status, 404);
});

test("the parse endpoint refuses a malformed repository id", async () => {
  const response = await call("/v1/parse?repo=not-a-repo");
  assert.equal(response.status, 400);
  const body = (await response.json()) as { error: { code: string } };
  assert.equal(body.error.code, "bad_request");
});

test("the parse endpoint refuses a missing repository id", async () => {
  const response = await call("/v1/parse");
  assert.equal(response.status, 400);
});
