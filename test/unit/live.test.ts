import { test } from "node:test";
import assert from "node:assert/strict";
import {
  aggregate,
  collectModels,
  estimateDownloadsPerSecond,
  fetchAllModels,
  isHereticModel,
  sampleDownloadEvents,
  withModelExpansions,
  type HubModel,
} from "../../src/core/live.ts";

const tagged: HubModel[] = [
  { id: "a/one", downloads: 10, downloadsAllTime: 100, likes: 1, tags: ["heretic"] },
  { id: "a/two", downloads: 5, downloadsAllTime: 500, likes: 2, tags: ["heretic"] },
];

const named: HubModel[] = [
  { id: "a/one", downloads: 10, downloadsAllTime: 100, likes: 1 },
  { id: "b/three", downloads: 1, downloadsAllTime: 50, likes: 0 },
];

test("the tagged pass wins a duplicate", () => {
  const merged = collectModels(tagged, named);
  const one = merged.find((model) => model.id === "a/one");
  assert.equal(one?.source, "tagged");
  assert.equal(merged.length, 3);
});

test("merged models are ordered by all-time downloads descending", () => {
  const merged = collectModels(tagged, named);
  assert.deepEqual(
    merged.map((model) => model.id),
    ["a/two", "a/one", "b/three"],
  );
});

test("a creator scope keeps only the models that look heretic", () => {
  const merged = collectModels(tagged, named, { filterHeretic: true });
  assert.deepEqual(
    merged.map((model) => model.id),
    ["a/two", "a/one"],
  );
});

test("a model counts as heretic by tag or by name", () => {
  assert.equal(isHereticModel({ id: "x/y", tags: ["heretic"] }), true);
  assert.equal(isHereticModel({ id: "x/heretic-y", tags: [] }), true);
  assert.equal(isHereticModel({ id: "x/y", tags: ["text-generation"] }), false);
});

test("the aggregation sums the counts", () => {
  const totals = aggregate(collectModels(tagged, named));
  assert.deepEqual(totals, {
    modelCount: 3,
    allTimeDownloads: 650,
    last30DaysDownloads: 16,
  });
});

test("the expansions always include downloads, downloadsAllTime and tags", () => {
  const url = new URL(withModelExpansions("https://huggingface.co/api/models?limit=1000&expand[]=likes"));
  const expands = url.searchParams.getAll("expand[]");
  assert.ok(expands.includes("downloads"));
  assert.ok(expands.includes("downloadsAllTime"));
  assert.ok(expands.includes("tags"));
  assert.ok(expands.includes("likes"));
  assert.equal(url.searchParams.getAll("expand").length, 0);
});

test("pagination walks to the end and stops at the page cap", async () => {
  const pages = [
    { models: [{ id: "a/1" }], next: "page-2" },
    { models: [{ id: "a/2" }], next: null },
  ];
  let call = 0;
  const models = await fetchAllModels(async () => pages[call++], "start");
  assert.equal(models.length, 2);

  await assert.rejects(
    () =>
      fetchAllModels(
        async () => ({ models: [{ id: "a/1" }], next: "always-more" }),
        "start",
        { maxPages: 3 },
      ),
    /exceeded 3 pages/,
  );
});

test("the derived rate divides the 30-day mean by the window", () => {
  const window = 30 * 24 * 60 * 60;
  assert.equal(estimateDownloadsPerSecond(window), 1);
  assert.equal(estimateDownloadsPerSecond(0), 0);
  assert.equal(estimateDownloadsPerSecond(-5), 0);
  assert.equal(estimateDownloadsPerSecond(100, 0), 0);
});

test("the download sampler is deterministic for a seeded source", () => {
  const source = () => {
    let state = 42;
    return () => {
      state = (state * 1664525 + 1013904223) % 4294967296;
      return state / 4294967296;
    };
  };
  const first = sampleDownloadEvents(0.5, 60, source());
  const second = sampleDownloadEvents(0.5, 60, source());
  assert.equal(first, second);
  assert.ok(Number.isInteger(first));
});

test("the download sampler draws nothing for a non-positive rate", () => {
  assert.equal(sampleDownloadEvents(0, 60, () => 0.5), 0);
  assert.equal(sampleDownloadEvents(-1, 60, () => 0.5), 0);
  assert.equal(sampleDownloadEvents(1, 0, () => 0.5), 0);
});

test("the download sampler mean tracks the rate", () => {
  const source = () => {
    let state = 7;
    return () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
  };
  let total = 0;
  const runs = 400;
  for (let i = 0; i < runs; i += 1) total += sampleDownloadEvents(2, 30, source());
  const mean = total / runs;
  assert.ok(Math.abs(mean - 60) < 12, `mean ${mean} should be near 60`);
});
