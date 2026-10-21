import { test } from "node:test";
import assert from "node:assert/strict";
import { loadCard, PARSER_VERSION, type CardCacheEntry } from "../../scripts/lib/incremental.ts";
import { mapLimit } from "../../scripts/lib/pool.ts";
import {
  apiRowsFromSnapshot,
  assignModelRanks,
  assignRanks,
  buildCreators,
  buildFacets,
} from "../../scripts/lib/dataset-rows.ts";
import type { ParsedCard, Snapshot } from "../../src/core/types.ts";

function emptyCard(): ParsedCard {
  return {
    baseModelIds: [],
    baseModelEvidence: null,
    hereticVersion: null,
    isHereticConversion: false,
    referencesHereticProject: false,
    metrics: {
      kl: null,
      refusals: null,
      refusalTotal: null,
      originalKl: null,
      originalRefusals: null,
      originalRefusalTotal: null,
      confidence: "none",
      evidence: null,
      sourceRepoId: null,
    },
    benchmarks: [],
    license: null,
    languages: [],
    quantizedBy: null,
    formatHints: [],
    kindHint: null,
  };
}

test("the pool preserves the input order", async () => {
  const input = [5, 1, 4, 2, 3];
  const output = await mapLimit(input, 2, async (value) => {
    await new Promise((resolve) => setTimeout(resolve, value));
    return value * 2;
  });
  assert.deepEqual(output, [10, 2, 8, 4, 6]);
});

test("the pool never runs more than the limit at once", async () => {
  let running = 0;
  let peak = 0;
  await mapLimit(Array.from({ length: 20 }, (_, index) => index), 3, async () => {
    running += 1;
    peak = Math.max(peak, running);
    await new Promise((resolve) => setTimeout(resolve, 5));
    running -= 1;
  });
  assert.ok(peak <= 3, `peak concurrency was ${peak}`);
});

test("a cached card with the current parser version is reused", async () => {
  const cached: CardCacheEntry = {
    sha: "abc",
    parserVersion: PARSER_VERSION,
    markdown: "# card",
    card: null,
  };
  let fetched = 0;
  const result = await loadCard(
    { id: "a/b", sha: "abc" },
    cached,
    async () => {
      fetched += 1;
      return "# card";
    },
    () => emptyCard(),
  );
  assert.equal(result.fetched, false);
  assert.equal(result.changed, false);
  assert.equal(fetched, 0);
});

test("a card with a stale parser version is re-parsed and marked changed", async () => {
  const cached: CardCacheEntry = {
    sha: "abc",
    parserVersion: PARSER_VERSION - 1,
    markdown: "# card",
    card: null,
  };
  let fetched = 0;
  let parsed = 0;
  const result = await loadCard(
    { id: "a/b", sha: "abc" },
    cached,
    async () => {
      fetched += 1;
      return "# card";
    },
    () => {
      parsed += 1;
      return emptyCard();
    },
  );
  // The markdown is already in the cache, so nothing is fetched.
  assert.equal(fetched, 0);
  assert.equal(parsed, 1);
  // The entry differs from the one on disk, so it has to be written back.
  // Without this the parser version never advances and every crawl re-parses
  // every card.
  assert.equal(result.changed, true);
  assert.equal(result.entry.parserVersion, PARSER_VERSION);
});

test("a card with a changed commit is fetched again", async () => {
  const cached: CardCacheEntry = {
    sha: "old",
    parserVersion: PARSER_VERSION,
    markdown: "# card",
    card: null,
  };
  let fetched = 0;
  const result = await loadCard(
    { id: "a/b", sha: "new" },
    cached,
    async () => {
      fetched += 1;
      return "# card";
    },
    () => emptyCard(),
  );
  assert.equal(fetched, 1);
  assert.equal(result.fetched, true);
  assert.equal(result.changed, true);
});

test("a repository with no commit hash is always fetched", async () => {
  const cached: CardCacheEntry = {
    sha: "",
    parserVersion: PARSER_VERSION,
    markdown: "# card",
    card: null,
  };
  let fetched = 0;
  await loadCard(
    { id: "a/b", sha: "" },
    cached,
    async () => {
      fetched += 1;
      return "# card";
    },
    () => emptyCard(),
  );
  assert.equal(fetched, 1);
});

export function snapshotFixture(): Snapshot {
  return {
    schemaVersion: 1,
    updatedAt: "2026-10-21T00:00:00.000Z",
    generator: "test",
    source: "huggingface-hub",
    totals: {
      repos: 2,
      verifiedRepos: 2,
      unverifiedRepos: 0,
      origins: 1,
      recipes: 1,
      rankedRecipes: 1,
      directConversions: 1,
      downloadsAllTime: 300,
      downloads30d: 30,
    },
    origins: [
      {
        id: "base/model",
        owner: "base",
        name: "model",
        displayName: "model",
        family: "Other",
        familySlug: "other",
        paramsB: 7,
        paramsActiveB: null,
        sizeClass: "4-9b",
        moe: false,
        recipeCount: 1,
        rankedCount: 1,
        bestRecipeId: "rcp_1",
        bestScore: 90,
        bestKl: 0.1,
        bestRefusalRate: 0.1,
        verifiedRepoCount: 2,
        downloadsAllTime: 300,
        downloads30d: 30,
        lastModified: "2026-10-20T00:00:00.000Z",
      },
    ],
    recipes: [
      {
        id: "rcp_1",
        originId: "base/model",
        author: "someone",
        repoIds: ["a/one", "b/two"],
        bestRepoId: "a/one",
        kind: "heretic",
        kl: 0.1,
        refusals: 10,
        refusalTotal: 100,
        refusalRate: 0.1,
        score: 90,
        pareto: true,
        bestPick: true,
        implausible: false,
        confidence: "medium",
        verification: "verified",
        hereticVersion: "1.2.0",
        formats: ["gguf"],
        paramsB: 7,
        downloadsAllTime: 300,
        downloads30d: 30,
        likes: 2,
        lastModified: "2026-10-20T00:00:00.000Z",
        benchmarks: [],
        evidenceRepoId: "a/one",
      },
    ],
    repos: [
      {
        id: "a/one",
        author: "a",
        createdAt: "2026-01-01T00:00:00.000Z",
        lastModified: "2026-10-20T00:00:00.000Z",
        downloads30d: 20,
        downloadsAllTime: 200,
        likes: 2,
        gated: false,
        pipelineTag: "text-generation",
        libraryName: "transformers",
        declaredBaseModels: ["base/model"],
        kind: "heretic",
        originId: "base/model",
        recipeId: "rcp_1",
        paramsB: 7,
        paramsActiveB: null,
        moe: false,
        sizeClass: "4-9b",
        family: "Other",
        familySlug: "other",
        formats: ["gguf"],
        quant: "Q4_K_M",
        metrics: {
          kl: 0.1,
          refusals: 10,
          refusalTotal: 100,
          originalKl: null,
          originalRefusals: null,
          originalRefusalTotal: null,
          confidence: "medium",
          evidence: "| KL | 0.1 |",
          sourceRepoId: null,
        },
        benchmarks: [],
        hereticVersion: "1.2.0",
        parentIds: ["base/model"],
        verified: true,
        classificationEvidence: "card states the weights were abliterated with Heretic",
        firstSeenAt: "2026-01-01T00:00:00.000Z",
        license: "apache-2.0",
      },
      {
        id: "b/two",
        author: "b",
        createdAt: "2026-01-02T00:00:00.000Z",
        lastModified: "2026-10-19T00:00:00.000Z",
        downloads30d: 10,
        downloadsAllTime: 100,
        likes: 0,
        gated: false,
        pipelineTag: "text-generation",
        libraryName: "transformers",
        declaredBaseModels: ["base/model"],
        kind: "quant",
        originId: "base/model",
        recipeId: "rcp_1",
        paramsB: 7,
        paramsActiveB: null,
        moe: false,
        sizeClass: "4-9b",
        family: "Other",
        familySlug: "other",
        formats: ["gguf"],
        quant: null,
        metrics: {
          kl: 0.1,
          refusals: 10,
          refusalTotal: 100,
          originalKl: null,
          originalRefusals: null,
          originalRefusalTotal: null,
          confidence: "inherited",
          evidence: "| KL | 0.1 |",
          sourceRepoId: "a/one",
        },
        benchmarks: [],
        hereticVersion: "1.2.0",
        parentIds: ["base/model"],
        verified: true,
        classificationEvidence: "quantized artifact of a Heretic model",
        firstSeenAt: "2026-01-02T00:00:00.000Z",
        license: null,
      },
    ],
    families: [
      {
        slug: "other",
        label: "Other",
        originCount: 1,
        rankedRecipeCount: 1,
        bestRecipeId: "rcp_1",
        downloadsAllTime: 300,
      },
    ],
  };
}

test("the rows carry the address of the model, the ablation and the artifact", () => {
  const rows = apiRowsFromSnapshot(snapshotFixture());
  assert.equal(rows.models[0].url, "https://huggingface.co/base/model");
  assert.equal(rows.recipes[0].url, "https://huggingface.co/a/one");
  assert.equal(rows.repos[0].url, "https://huggingface.co/a/one");
  assert.equal(rows.repos[1].url, "https://huggingface.co/b/two");
});

test("the artifact metrics sit at the top level, like the ablation's", () => {
  const rows = apiRowsFromSnapshot(snapshotFixture());
  assert.equal(rows.repos[0].kl, 0.1);
  assert.equal(rows.repos[0].refusals, 10);
  assert.equal(rows.repos[0].confidence, "medium");
  assert.equal(rows.repos[1].confidence, "inherited");
  assert.equal(rows.repos[1].inheritedFrom, "a/one");
});

test("the version facet counts the artifacts, not the values", () => {
  const rows = apiRowsFromSnapshot(snapshotFixture());
  const versions = rows.meta.facets.versions;
  assert.equal(versions.length, 1);
  assert.equal(versions[0].value, "1.2.0");
  // Two artifacts use the version, so the count is two.
  assert.equal(versions[0].count, 2);
  assert.equal(versions[0].downloadsAllTime, 300);
});

test("the ranks are assigned from the canonical order", () => {
  const rows = apiRowsFromSnapshot(snapshotFixture());
  assert.equal(rows.recipes[0].rank, 1);
  assert.equal(rows.recipes[0].familyRank, 1);
  assert.equal(rows.models[0].rank, 1);
});

test("an uncorroborated ablation never holds a rank above a corroborated one", () => {
  const rows = apiRowsFromSnapshot(snapshotFixture());
  rows.recipes[0].verification = "unverified";
  assignRanks(rows.recipes);
  assert.equal(rows.recipes[0].rank, 1);
  rows.recipes[0].verification = "verified";
});

test("a creator owns every ablation they published", () => {
  const rows = apiRowsFromSnapshot(snapshotFixture());
  const creators = buildCreators(rows.repos, rows.recipes, "2026-10-21T00:00:00.000Z");
  const names = creators.map((creator) => creator.username).sort();
  assert.deepEqual(names, ["a", "b"]);
  const a = creators.find((creator) => creator.username === "a");
  assert.equal(a?.totals.modelCount, 1);
});

test("the version hash does not move when the data does not", () => {
  const first = apiRowsFromSnapshot(snapshotFixture());
  const second = apiRowsFromSnapshot(snapshotFixture());
  assert.equal(first.meta.version, second.meta.version);

  // The hash covers the published rows, so the input has to change for it to
  // move.
  const changed = snapshotFixture();
  changed.origins[0].displayName = "changed";
  const third = apiRowsFromSnapshot(changed);
  assert.notEqual(first.meta.version, third.meta.version);
});

test("the facets are derived from the rows", () => {
  const rows = apiRowsFromSnapshot(snapshotFixture());
  const facets = buildFacets(rows.recipes, rows.repos, rows.models);
  assert.equal(facets.kinds.length, 2);
  assert.equal(facets.licenses.length, 1);
  assert.equal(facets.sizes.length, 1);
  // The tags come from the crawl, so a snapshot alone carries none.
  assert.equal(facets.tags.length, 0);
});

test("the model ranks are assigned over the models that lead with one", () => {
  const rows = apiRowsFromSnapshot(snapshotFixture());
  rows.models[0].bestRecipe = null;
  assignModelRanks(rows.models);
  assert.equal(rows.models[0].rank, null);
});
