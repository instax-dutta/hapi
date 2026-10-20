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
  bestRecipeId: string | null;
  bestScore: number | null;
  bestKl: number | null;
  bestRefusalRate: number | null;
  verifiedRepoCount: number;
  downloadsAllTime: number;
  downloads30d: number;
  lastModified: string;
}

/** One ablation attempt. This is what a leaderboard ranks. */
export interface RecipeRow {
  id: string;
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
  likes: number;
  lastModified: string;
  repoCount: number;
  bestRepoId: string;
  evidenceRepoId: string;
  benchmarks: Benchmark[];
  /** The exact snippet the numbers came from. */
  evidence: string | null;
}

/** One published artifact. */
export interface RepoRow {
  id: string;
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
  classificationEvidence: string;
  metrics: {
    kl: number | null;
    refusals: number | null;
    refusalTotal: number | null;
    confidence: MetricConfidence;
    /** The repo this artifact inherited its numbers from, when it inherited. */
    sourceRepoId: string | null;
    evidence: string | null;
  };
}

export interface FamilyRow {
  slug: string;
  label: string;
  originCount: number;
  rankedRecipeCount: number;
  bestRecipeId: string | null;
  downloadsAllTime: number;
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
  counts: { models: number; recipes: number; repos: number };
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

export interface CreatorStats extends StatsScope {
  scope: "user";
  username: string;
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
