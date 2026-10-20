import { test } from "node:test";
import assert from "node:assert/strict";
import { baseIdsFor, classifyRepos, type RepoInput } from "../../src/core/classify.ts";
import {
  buildRecipes,
  bestVerification,
  recipeIdFor,
  verificationFor,
  KL_FLOOR,
} from "../../src/core/recipes.ts";
import type { Metrics, ParsedCard, RawRepo } from "../../src/core/types.ts";

function repo(overrides: Partial<RawRepo> = {}): RawRepo {
  return {
    id: "coder3101/gemma-3-12b-it-heretic",
    author: "coder3101",
    sha: "abc",
    createdAt: "2026-01-01T00:00:00.000Z",
    lastModified: "2026-02-01T00:00:00.000Z",
    downloads30d: 10,
    downloadsAllTime: 100,
    likes: 1,
    tags: ["heretic"],
    gated: false,
    pipelineTag: "text-generation",
    libraryName: "transformers",
    declaredBaseModels: ["google/gemma-3-12b-it"],
    cardBaseModel: null,
    cardQuantizedBy: null,
    safetensorsTotal: 12_000_000_000,
    files: ["model.safetensors"],
    license: "gemma",
    ...overrides,
  };
}

function card(overrides: Partial<ParsedCard> = {}): ParsedCard {
  return {
    baseModelIds: [],
    baseModelEvidence: null,
    hereticVersion: "1.2.0",
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
    ...overrides,
  };
}

function metrics(overrides: Partial<Metrics> = {}): Metrics {
  return {
    kl: 0.05,
    refusals: 1,
    refusalTotal: 100,
    originalKl: null,
    originalRefusals: null,
    originalRefusalTotal: null,
    confidence: "medium",
    evidence: "| KL | 0.05 |",
    sourceRepoId: null,
    ...overrides,
  };
}

test("a declared base model is read from the card and the hub metadata", () => {
  const input: RepoInput = {
    repo: repo({ declaredBaseModels: ["google/gemma-3-12b-it", "google/gemma-3-12b-it"] }),
    card: card({ baseModelIds: ["other/model"] }),
  };
  assert.deepEqual(baseIdsFor(input), ["other/model", "google/gemma-3-12b-it"]);
});

test("a repository never lists itself as a base", () => {
  const input: RepoInput = {
    repo: repo({ id: "a/b", declaredBaseModels: ["a/b"] }),
    card: card({ baseModelIds: ["A/B"] }),
  };
  assert.deepEqual(baseIdsFor(input), []);
});

test("a conversion resolves to the canonical upstream model", () => {
  const inputs: RepoInput[] = [
    { repo: repo(), card: card({ isHereticConversion: true }) },
  ];
  const result = classifyRepos(inputs);
  const classification = result.get("coder3101/gemma-3-12b-it-heretic");
  assert.equal(classification?.kind, "heretic");
  assert.equal(classification?.originId, "google/gemma-3-12b-it");
  assert.equal(classification?.verified, true);
});

test("a quantisation of a conversion is a quant, not a second ablation", () => {
  const inputs: RepoInput[] = [
    { repo: repo(), card: card({ isHereticConversion: true }) },
    {
      repo: repo({
        id: "mradermacher/gemma-3-12b-it-heretic-GGUF",
        author: "mradermacher",
        declaredBaseModels: ["coder3101/gemma-3-12b-it-heretic"],
        files: ["model.Q4_K_M.gguf"],
        tags: ["gguf"],
      }),
      card: card(),
    },
  ];
  const result = classifyRepos(inputs);
  assert.equal(result.get("mradermacher/gemma-3-12b-it-heretic-GGUF")?.kind, "quant");
  assert.equal(
    result.get("mradermacher/gemma-3-12b-it-heretic-GGUF")?.originId,
    "google/gemma-3-12b-it",
  );
});

test("a base-model cycle is broken and marked", () => {
  const inputs: RepoInput[] = [
    { repo: repo({ id: "a/one", declaredBaseModels: ["a/two"] }), card: card() },
    { repo: repo({ id: "a/two", declaredBaseModels: ["a/one"] }), card: card() },
  ];
  const result = classifyRepos(inputs);
  assert.equal(result.get("a/one")?.verified, false);
  assert.equal(result.get("a/one")?.evidence, "base-model cycle");
});

test("one spelling wins for an origin that was written two ways", () => {
  const inputs: RepoInput[] = [
    { repo: repo({ id: "a/one", declaredBaseModels: ["google/Gemma-3-12B-it"] }), card: card({ isHereticConversion: true }) },
    { repo: repo({ id: "b/two", declaredBaseModels: ["google/gemma-3-12b-it"] }), card: card({ isHereticConversion: true }) },
  ];
  const result = classifyRepos(inputs);
  const origins = new Set(
    [...result.values()].map((classification) => classification.originId).filter(Boolean),
  );
  assert.equal(origins.size, 1);
});

test("a repository that ships weights with a possible divergence is corroborated", () => {
  const evidence = { repo: repo(), classification: { kind: "heretic" as const, parents: [], originId: "x", verified: true, evidence: "" } };
  assert.equal(verificationFor(evidence, 0.05), "verified");
  assert.equal(verificationFor(evidence, 0), "unverified");
  assert.equal(
    verificationFor({ ...evidence, repo: repo({ safetensorsTotal: 0 }) }, 0.05),
    "unverified",
  );
});

test("a divergence below the floor is not a measurement", () => {
  assert.ok(KL_FLOOR > 0);
  const evidence = { repo: repo(), classification: { kind: "heretic" as const, parents: [], originId: "x", verified: true, evidence: "" } };
  assert.equal(verificationFor(evidence, KL_FLOOR / 2), "unverified");
});

test("a merged recipe keeps the strongest verification of its parts", () => {
  assert.equal(bestVerification("unverified", "verified"), "verified");
  assert.equal(bestVerification("verified", "unverified"), "verified");
  assert.equal(bestVerification("unverified", "unverified"), "unverified");
  assert.equal(bestVerification("publisher", "verified"), "publisher");
});

test("a recipe id is stable for the same signature", () => {
  assert.equal(recipeIdFor("a|1|2|3|1.0.0"), recipeIdFor("a|1|2|3|1.0.0"));
  assert.notEqual(recipeIdFor("a|1|2|3|1.0.0"), recipeIdFor("a|1|2|3|1.0.1"));
  assert.match(recipeIdFor("a"), /^rcp_[0-9a-f]{8}$/);
});

test("an artifact without its own numbers inherits the recipe evidence", () => {
  const inputs = [
    {
      repo: repo(),
      card: card({ isHereticConversion: true, metrics: metrics() }),
      classification: {
        kind: "heretic" as const,
        parents: ["google/gemma-3-12b-it"],
        originId: "google/gemma-3-12b-it",
        verified: true,
        evidence: "",
      },
    },
    {
      repo: repo({
        id: "mradermacher/gemma-3-12b-it-heretic-GGUF",
        author: "mradermacher",
        declaredBaseModels: ["coder3101/gemma-3-12b-it-heretic"],
        files: ["model.gguf"],
        tags: ["gguf"],
      }),
      card: card(),
      classification: {
        kind: "quant" as const,
        parents: ["coder3101/gemma-3-12b-it-heretic"],
        originId: "google/gemma-3-12b-it",
        verified: true,
        evidence: "",
      },
    },
  ];

  const { recipes, metricsByRepo, recipeByRepo } = buildRecipes(inputs);
  assert.equal(recipes.length, 1);
  const inherited = metricsByRepo.get("mradermacher/gemma-3-12b-it-heretic-GGUF");
  assert.equal(inherited?.confidence, "inherited");
  assert.equal(inherited?.sourceRepoId, "coder3101/gemma-3-12b-it-heretic");
  assert.equal(
    recipeByRepo.get("mradermacher/gemma-3-12b-it-heretic-GGUF"),
    recipes[0].id,
  );
});

test("an artifact that published its own pair keeps its own confidence", () => {
  const inputs = [
    {
      repo: repo(),
      card: card({ isHereticConversion: true, metrics: metrics({ kl: 0.05 }) }),
      classification: {
        kind: "heretic" as const,
        parents: ["google/gemma-3-12b-it"],
        originId: "google/gemma-3-12b-it",
        verified: true,
        evidence: "",
      },
    },
    {
      repo: repo({
        id: "mradermacher/gemma-3-12b-it-heretic-GGUF",
        author: "mradermacher",
        declaredBaseModels: ["coder3101/gemma-3-12b-it-heretic"],
        files: ["model.gguf"],
        tags: ["gguf"],
      }),
      card: card({ metrics: metrics({ kl: 0.07, confidence: "high" }) }),
      classification: {
        kind: "quant" as const,
        parents: ["coder3101/gemma-3-12b-it-heretic"],
        originId: "google/gemma-3-12b-it",
        verified: true,
        evidence: "",
      },
    },
  ];

  const { metricsByRepo } = buildRecipes(inputs);
  const own = metricsByRepo.get("mradermacher/gemma-3-12b-it-heretic-GGUF");
  assert.equal(own?.confidence, "high");
  assert.equal(own?.kl, 0.07);
  assert.equal(own?.sourceRepoId, null);
});
