import { test } from "node:test";
import assert from "node:assert/strict";
import handler from "../../src/index.ts";
import { emptyStore, fixtureStore, modelRow, recipeRow } from "../helpers/fixtures.ts";
import type { DatasetStore } from "../../src/lib/store.ts";

function call(path: string, store: DatasetStore = fixtureStore(), init: RequestInit = {}) {
  const request = new Request(`https://hapi.sdad.pro${path}`, init);
  return handler.fetch(request, { HAPI_STORE: store }, undefined);
}

test("the service index names every endpoint", async () => {
  const response = await call("/v1");
  assert.equal(response.status, 200);
  const body = (await response.json()) as { service: string; endpoints: Record<string, string> };
  assert.equal(body.service, "hapi");
  assert.equal(body.endpoints.models, "/v1/models");
  assert.equal(body.endpoints.leaderboard, "/v1/recipes");
});

test("the health endpoint reports the dataset age", async () => {
  const response = await call("/v1/health");
  const body = (await response.json()) as {
    status: string;
    dataset: { version: string; ageSeconds: number | null };
  };
  assert.equal(body.status, "ok");
  assert.equal(body.dataset.version, "abc123");
  assert.ok(body.dataset.ageSeconds === null || body.dataset.ageSeconds >= 0);
});

test("the metadata endpoint reports the totals and the families", async () => {
  const response = await call("/v1/meta");
  const body = (await response.json()) as { totals: { origins: number }; families: unknown[] };
  assert.equal(body.totals.origins, 1);
  assert.equal(body.families.length, 1);
});

test("the families endpoint lists the families", async () => {
  const response = await call("/v1/families");
  const body = (await response.json()) as { total: number };
  assert.equal(body.total, 1);
});

test("the model list returns the standard envelope", async () => {
  const response = await call("/v1/models");
  const body = (await response.json()) as {
    updatedAt: string;
    total: number;
    page: number;
    pageCount: number;
    perPage: number;
    rows: Array<{ id: string }>;
  };
  assert.equal(body.total, 1);
  assert.equal(body.page, 1);
  assert.equal(body.pageCount, 1);
  assert.equal(body.perPage, 50);
  assert.equal(body.rows[0].id, "google/gemma-3-12b-it");
});

test("the model list filters by family", async () => {
  const store = fixtureStore({
    models: [modelRow(), modelRow({ id: "x/y", displayName: "y", familySlug: "llama-3" })],
  });
  const response = await call("/v1/models?family=llama-3", store);
  const body = (await response.json()) as { total: number; rows: Array<{ id: string }> };
  assert.equal(body.total, 1);
  assert.equal(body.rows[0].id, "x/y");
});

test("an unknown sort key falls back instead of failing", async () => {
  const response = await call("/v1/models?sort=bogus");
  assert.equal(response.status, 200);
});

test("a model detail carries its recipes and its artifacts", async () => {
  const response = await call("/v1/models/google/gemma-3-12b-it");
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    model: { id: string };
    recipes: unknown[];
    repos: unknown[];
  };
  assert.equal(body.model.id, "google/gemma-3-12b-it");
  assert.equal(body.recipes.length, 1);
  assert.equal(body.repos.length, 3);
});

test("the recipe list is the leaderboard", async () => {
  const response = await call("/v1/recipes");
  const body = (await response.json()) as { total: number; rows: Array<{ id: string }> };
  assert.equal(body.total, 1);
  assert.equal(body.rows[0].id, "rcp_a");
});

test("an unranked recipe is served and marked, never hidden", async () => {
  const store = fixtureStore({
    recipes: [recipeRow({ id: "rcp_b", score: 0, ranked: false, kl: 0, refusals: 0 })],
  });
  const response = await call("/v1/recipes?ranked=0", store);
  const body = (await response.json()) as { total: number; rows: Array<{ ranked: boolean }> };
  assert.equal(body.total, 1);
  assert.equal(body.rows[0].ranked, false);
});

test("an unranked recipe is left out of the ranked list by default", async () => {
  const store = fixtureStore({
    recipes: [recipeRow({ id: "rcp_b", score: 0, ranked: false })],
  });
  const response = await call("/v1/recipes", store);
  const body = (await response.json()) as { total: number };
  assert.equal(body.total, 0);
});

test("a recipe detail carries its origin and its artifacts", async () => {
  const response = await call("/v1/recipes/rcp_a");
  const body = (await response.json()) as {
    recipe: { id: string };
    model: { id: string } | null;
    repos: unknown[];
  };
  assert.equal(body.recipe.id, "rcp_a");
  assert.equal(body.model?.id, "google/gemma-3-12b-it");
  assert.equal(body.repos.length, 2);
});

test("the artifact list filters by author and by kind", async () => {
  const response = await call("/v1/repos?author=coder3101&kind=quant");
  const body = (await response.json()) as { total: number; rows: Array<{ id: string }> };
  assert.equal(body.total, 1);
  assert.equal(body.rows[0].id, "coder3101/gemma-3-12b-it-heretic-GGUF");
});

test("an artifact detail carries its recipe and its URL", async () => {
  const response = await call("/v1/repos/coder3101/gemma-3-12b-it-heretic");
  const body = (await response.json()) as {
    repo: { id: string };
    recipe: { id: string } | null;
    url: string;
  };
  assert.equal(body.repo.id, "coder3101/gemma-3-12b-it-heretic");
  assert.equal(body.recipe?.id, "rcp_a");
  assert.equal(body.url, "https://huggingface.co/coder3101/gemma-3-12b-it-heretic");
});

test("the global stats report the measurement and the derived rate", async () => {
  const response = await call("/v1/stats");
  const body = (await response.json()) as {
    scope: string;
    totals: { modelCount: number };
    rate: { basis: string; windowDays: number };
  };
  assert.equal(body.scope, "global");
  assert.equal(body.totals.modelCount, 3);
  assert.equal(body.rate.basis, "derived");
  assert.equal(body.rate.windowDays, 30);
});

test("a creator's stats are served under their username", async () => {
  const response = await call("/v1/stats/coder3101");
  assert.equal(response.status, 200);
  const body = (await response.json()) as { scope: string; username: string; models: unknown[] };
  assert.equal(body.scope, "user");
  assert.equal(body.username, "coder3101");
  assert.equal(body.models.length, 1);
});

test("a creator's username is matched case-insensitively", async () => {
  const response = await call("/v1/stats/Coder3101");
  assert.equal(response.status, 200);
  const body = (await response.json()) as { username: string };
  assert.equal(body.username, "coder3101");
});

test("the simulation is deterministic for a seed", async () => {
  const first = await call("/v1/simulate?rate=0.5&seconds=60&seed=42");
  const second = await call("/v1/simulate?rate=0.5&seconds=60&seed=42");
  const a = (await first.json()) as { events: number; expected: number };
  const b = (await second.json()) as { events: number };
  assert.equal(a.events, b.events);
  assert.equal(a.expected, 30);
});

test("the simulation derives a rate from a 30-day total", async () => {
  const response = await call("/v1/simulate?last30DaysDownloads=2592000&seconds=60");
  const body = (await response.json()) as { rate: number; source: string };
  assert.equal(body.source, "last30DaysDownloads");
  assert.equal(Math.round(body.rate * 1000) / 1000, 1);
});

test("the simulation refuses a request with no rate", async () => {
  const response = await call("/v1/simulate");
  assert.equal(response.status, 400);
});

test("the OpenAPI description is served", async () => {
  const response = await call("/v1/openapi.json");
  const body = (await response.json()) as { openapi: string; paths: Record<string, unknown> };
  assert.equal(body.openapi, "3.1.0");
  assert.ok(body.paths["/v1/models"]);
  assert.ok(body.paths["/v1/recipes"]);
});

test("the whole dataset is served in one document", async () => {
  const response = await call("/v1/dataset.json");
  const body = (await response.json()) as {
    meta: { version: string };
    models: unknown[];
    recipes: unknown[];
    repos: unknown[];
  };
  assert.equal(body.meta.version, "abc123");
  assert.equal(body.models.length, 1);
  assert.equal(body.repos.length, 3);
});

test("a missing dataset answers 503 and never a stack trace", async () => {
  const response = await call("/v1/models", emptyStore());
  assert.equal(response.status, 503);
  const body = (await response.json()) as { error: { code: string; message: string } };
  assert.equal(body.error.code, "dataset_unavailable");
  assert.equal(body.error.message.includes("Error"), false);
});

test("the dataset is only read once per isolate", async () => {
  const store = fixtureStore();
  await call("/v1/models", store);
  const readsAfterFirst = store.reads.length;
  await call("/v1/models", store);
  assert.equal(store.reads.length, readsAfterFirst);
});
