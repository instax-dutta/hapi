import { test } from "node:test";
import assert from "node:assert/strict";
import handler from "../../src/index.ts";
import { creatorRow, fixtureStore, modelRow, recipeRow, repoRow } from "../helpers/fixtures.ts";
import type { DatasetStore } from "../../src/lib/store.ts";

function call(path: string, store: DatasetStore = fixtureStore(), init: RequestInit = {}) {
  const request = new Request(`https://hapi.sdad.pro${path}`, init);
  return handler.fetch(request, { HAPI_STORE: store }, undefined);
}

test("a recipe carries its position on the leaderboard", async () => {
  const response = await call("/v1/recipes/rcp_a");
  const body = (await response.json()) as {
    recipe: { rank: number | null; familyRank: number | null; url: string };
  };
  assert.equal(body.recipe.rank, 1);
  assert.equal(body.recipe.familyRank, 1);
  assert.equal(body.recipe.url, "https://huggingface.co/coder3101/gemma-3-12b-it-heretic");
});

test("a model carries its position and the address of the upstream model", async () => {
  const response = await call("/v1/models/google/gemma-3-12b-it");
  const body = (await response.json()) as {
    model: { rank: number | null; url: string };
  };
  assert.equal(body.model.rank, 1);
  assert.equal(body.model.url, "https://huggingface.co/google/gemma-3-12b-it");
});

test("the summary leads with corroborated ablations only", async () => {
  const store = fixtureStore({
    recipes: [
      recipeRow({ id: "rcp_fake", verification: "unverified", score: 99 }),
      recipeRow({ id: "rcp_real", verification: "verified", score: 50 }),
    ],
  });
  const response = await call("/v1/summary", store);
  const body = (await response.json()) as { topRecipes: Array<{ id: string }> };
  assert.equal(body.topRecipes[0].id, "rcp_real");
});

test("a creator's leading ablation is a corroborated one", async () => {
  const store = fixtureStore({
    recipes: [
      recipeRow({ id: "rcp_fake", author: "coder3101", verification: "unverified", score: 99 }),
      recipeRow({ id: "rcp_real", author: "coder3101", verification: "verified", score: 50 }),
    ],
    creators: [
      creatorRow("coder3101", { bestScore: 50, recipeCount: 2, verifiedCount: 1 }),
    ],
  });
  const response = await call("/v1/creators/coder3101", store);
  const body = (await response.json()) as {
    creator: { bestScore: number | null };
    recipes: Array<{ id: string; verification: string }>;
  };
  assert.equal(body.creator.bestScore, 50);
  const leading = body.recipes[0];
  assert.equal(leading.verification, "verified");
});

test("the list sorts by the recent downloads", async () => {
  const store = fixtureStore({
    models: [
      modelRow({ id: "a/old", downloads30d: 1, downloadsAllTime: 999 }),
      modelRow({ id: "a/new", downloads30d: 500, downloadsAllTime: 500 }),
    ],
  });
  const response = await call("/v1/models?sort=recent", store);
  const body = (await response.json()) as { rows: Array<{ id: string }> };
  assert.equal(body.rows[0].id, "a/new");
});

test("the recent sort is descending by default", async () => {
  const store = fixtureStore({
    recipes: [
      recipeRow({ id: "rcp_a", downloads30d: 1 }),
      recipeRow({ id: "rcp_b", downloads30d: 900 }),
    ],
  });
  const response = await call("/v1/recipes?sort=recent", store);
  const body = (await response.json()) as { rows: Array<{ id: string }> };
  assert.equal(body.rows[0].id, "rcp_b");
});

test("the implausible filter drops the rows below the floor", async () => {
  const store = fixtureStore({
    recipes: [
      recipeRow({ id: "rcp_real", implausible: false }),
      recipeRow({ id: "rcp_floor", implausible: true, kl: 0 }),
    ],
  });
  const response = await call("/v1/recipes?implausible=0", store);
  const body = (await response.json()) as { total: number; rows: Array<{ id: string }> };
  assert.equal(body.total, 1);
  assert.equal(body.rows[0].id, "rcp_real");
});

test("the implausible filter keeps only the rows below the floor when asked", async () => {
  const store = fixtureStore({
    recipes: [
      recipeRow({ id: "rcp_real", implausible: false }),
      recipeRow({ id: "rcp_floor", implausible: true, kl: 0 }),
    ],
  });
  const response = await call("/v1/recipes?implausible=1", store);
  const body = (await response.json()) as { total: number; rows: Array<{ id: string }> };
  assert.equal(body.total, 1);
  assert.equal(body.rows[0].id, "rcp_floor");
});

test("the artifact list filters by the Heretic version", async () => {
  const store = fixtureStore({
    repos: [
      repoRow({ id: "a/one", hereticVersion: "1.2.0" }),
      repoRow({ id: "a/two", hereticVersion: "1.4.0" }),
    ],
  });
  const response = await call("/v1/repos?version=1.4.0", store);
  const body = (await response.json()) as { total: number; rows: Array<{ id: string }> };
  assert.equal(body.total, 1);
  assert.equal(body.rows[0].id, "a/two");
});

test("an artifact carries its numbers at the top level, like an ablation", async () => {
  const response = await call("/v1/repos/coder3101/gemma-3-12b-it-heretic");
  const body = (await response.json()) as {
    repo: { kl: number | null; refusals: number | null; confidence: string; url: string };
  };
  assert.equal(body.repo.kl, 0.012);
  assert.equal(body.repo.refusals, 1);
  assert.equal(body.repo.confidence, "medium");
  assert.equal(body.repo.url, "https://huggingface.co/coder3101/gemma-3-12b-it-heretic");
});

test("two ablations can be compared", async () => {
  const store = fixtureStore({
    recipes: [
      recipeRow({ id: "rcp_a", score: 90, kl: 0.01 }),
      recipeRow({ id: "rcp_b", score: 50, kl: 0.5 }),
    ],
  });
  const response = await call("/v1/compare?a=rcp_a&b=rcp_b", store);
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    a: { kind: string; recipe: { id: string } };
    b: { kind: string; recipe: { id: string } };
    difference: { bestScore: number | null };
  };
  assert.equal(body.a.kind, "recipe");
  assert.equal(body.a.recipe.id, "rcp_a");
  assert.equal(body.difference.bestScore, 40);
});

test("two artifacts can be compared", async () => {
  const store = fixtureStore({
    repos: [
      repoRow({ id: "a/one", downloadsAllTime: 100 }),
      repoRow({ id: "a/two", downloadsAllTime: 400 }),
    ],
  });
  const response = await call("/v1/compare?a=a/one&b=a/two", store);
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    a: { kind: string; repo: { id: string } };
    b: { kind: string; repo: { id: string } };
    difference: { downloadsAllTime: number | null };
  };
  assert.equal(body.a.kind, "repo");
  assert.equal(body.a.repo.id, "a/one");
  assert.equal(body.difference.downloadsAllTime, -300);
});

test("the comparison refuses an id that names nothing", async () => {
  const response = await call("/v1/compare?a=nothing/here&b=nothing/there");
  assert.equal(response.status, 404);
});
