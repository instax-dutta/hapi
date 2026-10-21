import { test } from "node:test";
import assert from "node:assert/strict";
import handler from "../../src/index.ts";
import {
  creatorRow,
  fixtureStore,
  modelRow,
  recipeRow,
  repoRow,
} from "../helpers/fixtures.ts";
import type { DatasetStore } from "../../src/lib/store.ts";

function call(path: string, store: DatasetStore = fixtureStore(), init: RequestInit = {}) {
  const request = new Request(`https://hapi.sdad.pro${path}`, init);
  return handler.fetch(request, { HAPI_STORE: store }, undefined);
}

test("the creator list is a leaderboard with the standard envelope", async () => {
  const response = await call("/v1/creators");
  const body = (await response.json()) as {
    total: number;
    rows: Array<{ username: string; totals: { allTimeDownloads: number } }>;
  };
  assert.equal(body.total, 1);
  assert.equal(body.rows[0].username, "coder3101");
  assert.equal(body.rows[0].totals.allTimeDownloads, 500);
});

test("the creator list sorts by downloads descending by default", async () => {
  const store = fixtureStore({
    creators: [
      creatorRow("small", { totals: { modelCount: 1, allTimeDownloads: 10, last30DaysDownloads: 1 } }),
      creatorRow("big", { totals: { modelCount: 9, allTimeDownloads: 900, last30DaysDownloads: 90 } }),
    ],
  });
  const response = await call("/v1/creators", store);
  const body = (await response.json()) as { rows: Array<{ username: string }> };
  assert.equal(body.rows[0].username, "big");
});

test("a creator detail carries their artifacts and their ablations", async () => {
  const response = await call("/v1/creators/coder3101");
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    creator: { username: string };
    repos: unknown[];
    recipes: unknown[];
  };
  assert.equal(body.creator.username, "coder3101");
  assert.equal(body.repos.length, 2);
  assert.equal(body.recipes.length, 1);
});

test("an unknown creator is a 404", async () => {
  const response = await call("/v1/creators/nobody");
  assert.equal(response.status, 404);
});

test("a family detail carries its models and its ablations", async () => {
  const response = await call("/v1/families/gemma-3");
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    family: { slug: string };
    models: unknown[];
    recipes: unknown[];
  };
  assert.equal(body.family.slug, "gemma-3");
  assert.equal(body.models.length, 1);
  assert.equal(body.recipes.length, 1);
});

test("an unknown family is a 404", async () => {
  const response = await call("/v1/families/nope");
  assert.equal(response.status, 404);
});

test("the facet endpoints list the values a client can filter by", async () => {
  for (const [path, facet] of [
    ["/v1/versions", "versions"],
    ["/v1/formats", "formats"],
    ["/v1/licenses", "licenses"],
    ["/v1/tags", "tags"],
    ["/v1/kinds", "kinds"],
    ["/v1/sizes", "sizes"],
  ] as const) {
    const response = await call(path);
    const body = (await response.json()) as {
      facet: string;
      total: number;
      values: Array<{ value: string; count: number }>;
    };
    assert.equal(body.facet, facet);
    assert.ok(body.total >= 1);
    assert.ok(body.values[0].value.length > 0);
  }
});

test("the summary carries the leading models, ablations and creators", async () => {
  const response = await call("/v1/summary");
  const body = (await response.json()) as {
    totals: { origins: number };
    counts: { models: number };
    topModels: Array<{ id: string }>;
    topRecipes: Array<{ id: string }>;
    topCreators: Array<{ username: string }>;
    topFamilies: Array<{ slug: string }>;
  };
  assert.equal(body.totals.origins, 1);
  assert.equal(body.counts.models, 1);
  assert.equal(body.topModels[0].id, "google/gemma-3-12b-it");
  assert.equal(body.topRecipes[0].id, "rcp_a");
  assert.equal(body.topCreators[0].username, "coder3101");
  assert.equal(body.topFamilies[0].slug, "gemma-3");
});

test("the comparison names both models and the difference between them", async () => {
  const store = fixtureStore({
    models: [
      modelRow(),
      modelRow({ id: "x/y", displayName: "y", bestScore: 50, bestKl: 0.5, downloadsAllTime: 200 }),
    ],
  });
  const response = await call(
    "/v1/compare?a=google/gemma-3-12b-it&b=x/y",
    store,
  );
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    a: { model: { id: string } };
    b: { model: { id: string } };
    difference: { bestScore: number | null; downloadsAllTime: number | null };
  };
  assert.equal(body.a.model.id, "google/gemma-3-12b-it");
  assert.equal(body.b.model.id, "x/y");
  assert.equal(body.difference.bestScore, 41.2);
  assert.equal(body.difference.downloadsAllTime, 800);
});

test("the comparison refuses a request with one side missing", async () => {
  const response = await call("/v1/compare?a=google/gemma-3-12b-it");
  assert.equal(response.status, 400);
});

test("the comparison reports an unknown model", async () => {
  const response = await call("/v1/compare?a=nope/nope&b=google/gemma-3-12b-it");
  assert.equal(response.status, 404);
});

test("a recipe row carries the base model's numbers and the reduction", async () => {
  const response = await call("/v1/recipes/rcp_a");
  const body = (await response.json()) as {
    recipe: {
      originalRefusals: number | null;
      baseRefusalRate: number | null;
      refusalReduction: number | null;
      benchmarkCount: number;
      repoIds: string[];
    };
  };
  assert.equal(body.recipe.originalRefusals, 40);
  assert.equal(body.recipe.baseRefusalRate, 0.4);
  assert.equal(body.recipe.refusalReduction, 0.39);
  assert.equal(body.recipe.benchmarkCount, 1);
  assert.equal(body.recipe.repoIds.length, 2);
});

test("a model row carries the best ablation in one object", async () => {
  const response = await call("/v1/models/google/gemma-3-12b-it");
  const body = (await response.json()) as {
    model: {
      bestRecipe: { id: string; score: number } | null;
      repoCount: number;
      hereticVersions: string[];
      authors: string[];
    };
  };
  assert.equal(body.model.bestRecipe?.id, "rcp_a");
  assert.equal(body.model.bestRecipe?.score, 91.2);
  assert.equal(body.model.repoCount, 3);
  assert.deepEqual(body.model.hereticVersions, ["1.2.0"]);
});

test("an artifact row carries the base chain and the Hub tags", async () => {
  const response = await call("/v1/repos/coder3101/gemma-3-12b-it-heretic");
  const body = (await response.json()) as {
    repo: { baseModels: string[]; parentIds: string[]; tags: string[]; isDirectConversion: boolean };
    model: { id: string } | null;
  };
  assert.deepEqual(body.repo.baseModels, ["google/gemma-3-12b-it"]);
  assert.deepEqual(body.repo.parentIds, ["google/gemma-3-12b-it"]);
  assert.deepEqual(body.repo.tags, ["heretic", "uncensored"]);
  assert.equal(body.repo.isDirectConversion, true);
  assert.equal(body.model?.id, "google/gemma-3-12b-it");
});

test("the recipe list filters by corroboration", async () => {
  const store = fixtureStore({
    recipes: [
      recipeRow({ id: "rcp_v", verification: "verified" }),
      recipeRow({ id: "rcp_u", verification: "unverified" }),
    ],
  });
  const response = await call("/v1/recipes?verification=unverified", store);
  const body = (await response.json()) as { total: number; rows: Array<{ id: string }> };
  assert.equal(body.total, 1);
  assert.equal(body.rows[0].id, "rcp_u");
});

test("the recipe list filters by the pareto frontier", async () => {
  const store = fixtureStore({
    recipes: [
      recipeRow({ id: "rcp_p", pareto: true }),
      recipeRow({ id: "rcp_n", pareto: false }),
    ],
  });
  const response = await call("/v1/recipes?pareto=1", store);
  const body = (await response.json()) as { total: number; rows: Array<{ id: string }> };
  assert.equal(body.total, 1);
  assert.equal(body.rows[0].id, "rcp_p");
});

test("the recipe list filters by a minimum score", async () => {
  const store = fixtureStore({
    recipes: [recipeRow({ id: "rcp_high", score: 90 }), recipeRow({ id: "rcp_low", score: 10 })],
  });
  const response = await call("/v1/recipes?minScore=50", store);
  const body = (await response.json()) as { total: number; rows: Array<{ id: string }> };
  assert.equal(body.total, 1);
  assert.equal(body.rows[0].id, "rcp_high");
});

test("the recipe list filters by a maximum divergence", async () => {
  const store = fixtureStore({
    recipes: [recipeRow({ id: "rcp_low", kl: 0.01 }), recipeRow({ id: "rcp_high", kl: 5 })],
  });
  const response = await call("/v1/recipes?maxKl=1", store);
  const body = (await response.json()) as { total: number; rows: Array<{ id: string }> };
  assert.equal(body.total, 1);
  assert.equal(body.rows[0].id, "rcp_low");
});

test("a list filters by the date the row was last modified", async () => {
  const store = fixtureStore({
    recipes: [
      recipeRow({ id: "rcp_new", lastModified: "2026-10-20T00:00:00.000Z" }),
      recipeRow({ id: "rcp_old", lastModified: "2026-01-01T00:00:00.000Z" }),
    ],
  });
  const response = await call("/v1/recipes?updatedAfter=2026-06-01T00:00:00.000Z", store);
  const body = (await response.json()) as { total: number; rows: Array<{ id: string }> };
  assert.equal(body.total, 1);
  assert.equal(body.rows[0].id, "rcp_new");
});

test("an unparseable date is ignored rather than matching nothing", async () => {
  const response = await call("/v1/recipes?updatedAfter=not-a-date");
  const body = (await response.json()) as { total: number };
  assert.equal(body.total, 1);
});

test("the artifact list filters by license and by quantization", async () => {
  const store = fixtureStore({
    repos: [
      repoRow({ id: "a/one", license: "gemma", quant: "Q4_K_M" }),
      repoRow({ id: "a/two", license: "apache-2.0", quant: null }),
    ],
  });
  const response = await call("/v1/repos?license=apache-2.0", store);
  const body = (await response.json()) as { total: number; rows: Array<{ id: string }> };
  assert.equal(body.total, 1);
  assert.equal(body.rows[0].id, "a/two");

  const quantResponse = await call("/v1/repos?quant=Q4_K_M", store);
  const quantBody = (await quantResponse.json()) as { total: number };
  assert.equal(quantBody.total, 1);
});

test("the artifact list filters to the direct conversions", async () => {
  const store = fixtureStore({
    repos: [
      repoRow({ id: "a/direct", isDirectConversion: true }),
      repoRow({ id: "a/derived", isDirectConversion: false }),
    ],
  });
  const response = await call("/v1/repos?direct=1", store);
  const body = (await response.json()) as { total: number; rows: Array<{ id: string }> };
  assert.equal(body.total, 1);
  assert.equal(body.rows[0].id, "a/direct");
});

test("the whole dataset now carries the creators", async () => {
  const response = await call("/v1/dataset.json");
  const body = (await response.json()) as {
    meta: { counts: { creators: number } };
    creators: Array<{ username: string }>;
  };
  assert.equal(body.meta.counts.creators, 1);
  assert.equal(body.creators[0].username, "coder3101");
});
