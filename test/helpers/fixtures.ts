/**
 * Test helpers.
 *
 * The fake store, the dataset builders and the request builders the suites
 * share. Everything here is deterministic and offline.
 */
import type {
  CreatorRow,
  DatasetMeta,
  ModelRow,
  RecipeRow,
  RepoRow,
  StatsScope,
} from "../../src/lib/types.ts";
import type { DatasetStore } from "../../src/lib/store.ts";

/** A store backed by a plain object. */
export class FakeStore implements DatasetStore {
  readonly reads: string[] = [];

  private readonly objects: Record<string, string>;

  constructor(objects: Record<string, string>) {
    this.objects = objects;
  }

  async get(key: string): Promise<string | null> {
    this.reads.push(key);
    const value = this.objects[key];
    return value === undefined ? null : value;
  }
}

export const NOW = "2026-10-21T09:00:00.000Z";

export function modelRow(overrides: Partial<ModelRow> = {}): ModelRow {
  return {
    id: "google/gemma-3-12b-it",
    url: "https://huggingface.co/google/gemma-3-12b-it",
    rank: 1,
    owner: "google",
    name: "gemma-3-12b-it",
    displayName: "gemma-3-12b-it",
    family: "Gemma 3",
    familySlug: "gemma-3",
    paramsB: 12,
    paramsActiveB: null,
    sizeClass: "9-15b",
    moe: false,
    recipeCount: 2,
    rankedCount: 2,
    repoCount: 3,
    bestRecipeId: "rcp_a",
    bestScore: 91.2,
    bestKl: 0.012,
    bestRefusalRate: 0.01,
    bestRecipe: {
      id: "rcp_a",
      author: "coder3101",
      implausible: false,
      score: 91.2,
      kl: 0.012,
      refusals: 1,
      refusalTotal: 100,
      refusalRate: 0.01,
      verification: "verified",
      confidence: "medium",
      hereticVersion: "1.2.0",
      downloadsAllTime: 500,
      lastModified: "2026-10-20T00:00:00.000Z",
      originalKl: 0.4,
      originalRefusals: 40,
      originalRefusalTotal: 100,
    },
    verifiedRepoCount: 3,
    downloadsAllTime: 1000,
    downloads30d: 100,
    downloadsPerDay: 3.333,
    likes: 3,
    lastModified: "2026-10-20T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    formats: ["gguf", "safetensors"],
    licenses: ["gemma"],
    hereticVersions: ["1.2.0"],
    authors: ["coder3101", "mradermacher"],
    ...overrides,
  };
}

export function recipeRow(overrides: Partial<RecipeRow> = {}): RecipeRow {
  return {
    id: "rcp_a",
    url: "https://huggingface.co/coder3101/gemma-3-12b-it-heretic",
    rank: 1,
    familyRank: 1,
    originId: "google/gemma-3-12b-it",
    originName: "gemma-3-12b-it",
    family: "Gemma 3",
    familySlug: "gemma-3",
    sizeClass: "9-15b",
    author: "coder3101",
    kind: "heretic",
    kl: 0.012,
    refusals: 1,
    refusalTotal: 100,
    refusalRate: 0.01,
    score: 91.2,
    ranked: true,
    pareto: true,
    bestPick: true,
    implausible: false,
    confidence: "medium",
    verification: "verified",
    hereticVersion: "1.2.0",
    formats: ["gguf", "safetensors"],
    paramsB: 12,
    downloadsAllTime: 500,
    downloads30d: 50,
    downloadsPerDay: 1.667,
    likes: 3,
    lastModified: "2026-10-20T00:00:00.000Z",
    createdAt: "2026-01-01T00:00:00.000Z",
    repoCount: 2,
    repoIds: ["coder3101/gemma-3-12b-it-heretic", "coder3101/gemma-3-12b-it-heretic-GGUF"],
    bestRepoId: "coder3101/gemma-3-12b-it-heretic",
    evidenceRepoId: "coder3101/gemma-3-12b-it-heretic",
    benchmarks: [{ metric: "MMLU-Pro", value: 0.6 }],
    benchmarkCount: 1,
    evidence: "| KL divergence | 0.012 |",
    originalKl: 0.4,
    originalRefusals: 40,
    originalRefusalTotal: 100,
    baseRefusalRate: 0.4,
    refusalReduction: 0.39,
    licenses: ["gemma"],
    quantizations: [],
    authors: ["coder3101"],
    ...overrides,
  };
}

export function repoRow(overrides: Partial<RepoRow> = {}): RepoRow {
  return {
    id: "coder3101/gemma-3-12b-it-heretic",
    url: "https://huggingface.co/coder3101/gemma-3-12b-it-heretic",
    author: "coder3101",
    originId: "google/gemma-3-12b-it",
    recipeId: "rcp_a",
    kind: "heretic",
    downloads30d: 50,
    downloadsAllTime: 500,
    likes: 3,
    paramsB: 12,
    sizeClass: "9-15b",
    family: "Gemma 3",
    familySlug: "gemma-3",
    formats: ["safetensors"],
    quant: null,
    license: "gemma",
    pipelineTag: "text-generation",
    libraryName: "transformers",
    gated: false,
    createdAt: "2026-01-01T00:00:00.000Z",
    lastModified: "2026-10-20T00:00:00.000Z",
    hereticVersion: "1.2.0",
    verified: true,
    isDirectConversion: true,
    classificationEvidence: "card states the weights were abliterated with Heretic",
    parentIds: ["google/gemma-3-12b-it"],
    tags: ["heretic", "uncensored"],
    safetensorsTotal: 12_000_000_000,
    benchmarkCount: 1,
    kl: 0.012,
    refusals: 1,
    refusalTotal: 100,
    confidence: "medium",
    evidence: "| KL divergence | 0.012 |",
    inheritedFrom: null,
    ...overrides,
  };
}

export function metaRow(overrides: Partial<DatasetMeta> = {}): DatasetMeta {
  return {
    version: "abc123",
    generatedAt: NOW,
    generator: "hapi",
    source: "huggingface-hub",
    totals: {
      repos: 3,
      verifiedRepos: 3,
      unverifiedRepos: 0,
      origins: 1,
      recipes: 1,
      rankedRecipes: 1,
      directConversions: 1,
      downloadsAllTime: 1000,
      downloads30d: 100,
    },
    families: [
      {
        slug: "gemma-3",
        label: "Gemma 3",
        originCount: 1,
        rankedRecipeCount: 1,
        bestRecipeId: "rcp_a",
        downloadsAllTime: 1000,
      },
    ],
    counts: { models: 1, recipes: 1, repos: 3, creators: 1 },
    facets: {
      versions: [{ value: "1.2.0", count: 3, downloadsAllTime: 1000 }],
      formats: [{ value: "gguf", count: 2, downloadsAllTime: 1000 }],
      licenses: [{ value: "gemma", count: 3, downloadsAllTime: 1000 }],
      tags: [{ value: "heretic", count: 3, downloadsAllTime: 1000 }],
      kinds: [{ value: "heretic", count: 1, downloadsAllTime: 500 }],
      sizes: [{ value: "9-15b", count: 1, downloadsAllTime: 1000 }],
    },
    ...overrides,
  };
}

export function statsRow(overrides: Partial<StatsScope> = {}): StatsScope {
  return {
    scope: "global",
    username: null,
    updatedAt: NOW,
    totals: {
      modelCount: 3,
      allTimeDownloads: 1000,
      last30DaysDownloads: 100,
    },
    rate: { downloadsPerSecond: 100 / (30 * 24 * 60 * 60), windowDays: 30, basis: "derived" },
    source: "Hugging Face Hub API",
    ...overrides,
  };
}

export function creatorRow(username: string, overrides: Partial<CreatorRow> = {}): CreatorRow {
  return {
    scope: "user",
    username,
    updatedAt: NOW,
    totals: { modelCount: 1, allTimeDownloads: 500, last30DaysDownloads: 50 },
    rate: { downloadsPerSecond: 50 / (30 * 24 * 60 * 60), windowDays: 30, basis: "derived" },
    source: "Hugging Face Hub API",
    recipeCount: 1,
    originCount: 1,
    likes: 3,
    bestScore: 91.2,
    bestKl: 0.012,
    bestRefusalRate: 0.01,
    verifiedCount: 1,
    lastModified: "2026-10-20T00:00:00.000Z",
    models: [
      {
        id: `${username}/gemma-3-12b-it-heretic`,
        url: `https://huggingface.co/${username}/gemma-3-12b-it-heretic`,
        downloads: 50,
        downloadsAllTime: 500,
        likes: 3,
      },
    ],
    ...overrides,
  };
}

export interface FixtureOptions {
  models?: ModelRow[];
  recipes?: RecipeRow[];
  repos?: RepoRow[];
  creators?: CreatorRow[];
}

/** A store holding a whole dataset. */
export function fixtureStore(options: FixtureOptions = {}): FakeStore {
  const models = options.models ?? [modelRow()];
  const recipes = options.recipes ?? [recipeRow()];
  const repos = options.repos ?? [
    repoRow(),
    repoRow({ id: "coder3101/gemma-3-12b-it-heretic-GGUF", kind: "quant", formats: ["gguf"], quant: "Q4_K_M" }),
    repoRow({ id: "mradermacher/gemma-3-12b-it-heretic-GGUF", author: "mradermacher", kind: "quant", formats: ["gguf"], recipeId: null }),
  ];
  const creators = options.creators ?? [creatorRow("coder3101")];
  const meta = metaRow({
    counts: {
      models: models.length,
      recipes: recipes.length,
      repos: repos.length,
      creators: creators.length,
    },
  });

  return new FakeStore({
    "meta.json": JSON.stringify(meta),
    "models.json": JSON.stringify({ origins: models }),
    "recipes.json": JSON.stringify({ recipes }),
    "repos.json": JSON.stringify({ repos }),
    "stats.json": JSON.stringify(statsRow()),
    "creators.json": JSON.stringify({ creators }),
    "dataset.json": JSON.stringify({ meta, models, recipes, repos, creators }),
  });
}

/** An empty store. Every lookup misses. */
export function emptyStore(): FakeStore {
  return new FakeStore({});
}
