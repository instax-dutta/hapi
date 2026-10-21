/**
 * The public API response types.
 *
 * These are the shapes a client sees. The dataset stores the same shapes, so
 * the API adds no translation layer between what is published and what is
 * served.
 *
 * The three entity levels are the domain's, not the API's invention:
 * an Origin is one canonical upstream model, a Recipe is one ablation attempt,
 * a Repo is one published artifact.
 */
import type {
  Benchmark,
  MetricConfidence,
  RepoKind,
  SizeClass,
  Verification,
} from "../core/types.ts";

export type { Benchmark, MetricConfidence, RepoKind, SizeClass, Verification };

/** One canonical upstream model. */
export interface ModelRow {
  id: string;
  /** The upstream model on the Hub. */
  url: string;
  owner: string;
  name: string;
  displayName: string;
  family: string;
  familySlug: string;
  paramsB: number | null;
  paramsActiveB: number | null;
  sizeClass: SizeClass;
  moe: boolean;
  recipeCount: number;
  rankedCount: number;
  /** How many artifacts publish this model. */
  repoCount: number;
  bestRecipeId: string | null;
  bestScore: number | null;
  bestKl: number | null;
  bestRefusalRate: number | null;
  /** The position among the models, best first. Null when it leads with none. */
  rank: number | null;
  /** The corroborated ablation that leads this model, in one object. */
  bestRecipe: BestRecipeSummary | null;
  verifiedRepoCount: number;
  downloadsAllTime: number;
  downloads30d: number;
  /** Derived from the 30-day mean. Not a measurement. */
  downloadsPerDay: number;
  likes: number;
  lastModified: string;
  createdAt: string;
  formats: string[];
  licenses: string[];
  /** The Heretic versions used by the artifacts of this model. */
  hereticVersions: string[];
  /** Everyone who published an artifact of this model. */
  authors: string[];
}

/** The corroborated ablation that leads a model. */
export interface BestRecipeSummary {
  id: string;
  author: string;
  /** The divergence is below the floor an ablation can produce. */
  implausible: boolean;
  score: number;
  kl: number;
  refusals: number;
  refusalTotal: number;
  refusalRate: number;
  verification: Verification;
  confidence: MetricConfidence;
  hereticVersion: string | null;
  downloadsAllTime: number;
  lastModified: string;
  /** The base model's numbers, when the card published them side by side. */
  originalKl: number | null;
  originalRefusals: number | null;
  originalRefusalTotal: number | null;
}

/** One ablation attempt. This is what a leaderboard ranks. */
export interface RecipeRow {
  id: string;
  /** The leading artifact on the Hub. */
  url: string;
  originId: string;
  originName: string;
  family: string;
  familySlug: string;
  sizeClass: SizeClass;
  author: string;
  kind: RepoKind;
  kl: number;
  refusals: number;
  refusalTotal: number;
  refusalRate: number;
  score: number;
  /** The position among the ranked ablations, best first. */
  rank: number | null;
  /** The position among the ablations of the same model. */
  familyRank: number | null;
  /** False when the card published no usable pair. The recipe is still served. */
  ranked: boolean;
  pareto: boolean;
  bestPick: boolean;
  /** The KL is below the floor an abliteration can produce. Not a measurement. */
  implausible: boolean;
  confidence: MetricConfidence;
  verification: Verification;
  hereticVersion: string | null;
  formats: string[];
  paramsB: number | null;
  downloadsAllTime: number;
  downloads30d: number;
  /** Derived from the 30-day mean. Not a measurement. */
  downloadsPerDay: number;
  likes: number;
  lastModified: string;
  createdAt: string;
  repoCount: number;
  /** Every artifact that carries this ablation. */
  repoIds: string[];
  bestRepoId: string;
  evidenceRepoId: string;
  benchmarks: Benchmark[];
  benchmarkCount: number;
  /** The exact snippet the numbers came from. */
  evidence: string | null;
  /** The base model's numbers, when the card published them side by side. */
  originalKl: number | null;
  originalRefusals: number | null;
  originalRefusalTotal: number | null;
  /** The base model's refusal rate. */
  baseRefusalRate: number | null;
  /** How much of the refusal rate the ablation removed. */
  refusalReduction: number | null;
  licenses: string[];
  quantizations: string[];
  /** Everyone who re-uploaded this same ablation. */
  authors: string[];
}

/** One published artifact. */
export interface RepoRow {
  id: string;
  /** The artifact on the Hub. */
  url: string;
  author: string;
  originId: string;
  recipeId: string | null;
  kind: RepoKind;
  downloads30d: number;
  downloadsAllTime: number;
  likes: number;
  paramsB: number | null;
  sizeClass: SizeClass;
  family: string;
  familySlug: string;
  formats: string[];
  quant: string | null;
  license: string | null;
  pipelineTag: string | null;
  libraryName: string | null;
  gated: boolean;
  createdAt: string;
  lastModified: string;
  hereticVersion: string | null;
  verified: boolean;
  /** True when the artifact is the ablation itself, not a derivative of one. */
  isDirectConversion: boolean;
  classificationEvidence: string;
  /** The immediate parents in the base chain. */
  parentIds: string[];
  /** The Hub's own tags. */
  tags: string[];
  /** The total parameter count the Hub reports, in parameters. */
  safetensorsTotal: number | null;
  benchmarkCount: number;
  /** The numbers this artifact publishes, or inherits. */
  kl: number | null;
  refusals: number | null;
  refusalTotal: number | null;
  confidence: MetricConfidence;
  /** The exact snippet the numbers came from. */
  evidence: string | null;
  /** The artifact this one inherited its numbers from, when it inherited. */
  inheritedFrom: string | null;
}

export interface FamilyRow {
  slug: string;
  label: string;
  originCount: number;
  rankedRecipeCount: number;
  bestRecipeId: string | null;
  downloadsAllTime: number;
}

/** One value of a facet, with how often it occurs. */
export interface FacetCount {
  value: string;
  count: number;
  downloadsAllTime: number;
}

/** The values a client can filter by, with their counts. */
export interface DatasetFacets {
  versions: FacetCount[];
  formats: FacetCount[];
  licenses: FacetCount[];
  tags: FacetCount[];
  kinds: FacetCount[];
  sizes: FacetCount[];
}

export interface DatasetTotals {
  repos: number;
  verifiedRepos: number;
  unverifiedRepos: number;
  origins: number;
  recipes: number;
  rankedRecipes: number;
  directConversions: number;
  downloadsAllTime: number;
  downloads30d: number;
}

export interface DatasetMeta {
  /** A content hash of the published dataset. Changes when the data changes. */
  version: string;
  /** When the dataset was built. */
  generatedAt: string;
  generator: string;
  source: string;
  totals: DatasetTotals;
  families: FamilyRow[];
  counts: { models: number; recipes: number; repos: number; creators: number };
  facets: DatasetFacets;
}

/** The measured download totals. */
export interface DownloadTotals {
  modelCount: number;
  allTimeDownloads: number;
  last30DaysDownloads: number;
}

/** The derived rate. Never a measurement. */
export interface DownloadRate {
  downloadsPerSecond: number;
  windowDays: number;
  /** Always "derived". Present so a client cannot mistake it for a measurement. */
  basis: "derived";
}

export interface StatsScope {
  scope: "global" | "user";
  username: string | null;
  updatedAt: string;
  totals: DownloadTotals;
  rate: DownloadRate;
  source: string;
}

/** One creator. */
export interface CreatorRow {
  scope: "user";
  username: string;
  updatedAt: string;
  totals: DownloadTotals;
  rate: DownloadRate;
  source: string;
  recipeCount: number;
  originCount: number;
  likes: number;
  bestScore: number | null;
  bestKl: number | null;
  bestRefusalRate: number | null;
  verifiedCount: number;
  lastModified: string;
  models: Array<{
    id: string;
    url: string;
    downloads: number;
    downloadsAllTime: number;
    likes: number;
  }>;
}

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  pageCount: number;
  perPage: number;
}

export interface ListEnvelope<T> extends Page<T> {
  updatedAt: string;
}

export interface ApiError {
  error: {
    status: number;
    code: string;
    message: string;
    docs: string;
  };
}
